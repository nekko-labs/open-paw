import type { ConnectorKind, ConnectorResource } from '@kotrain/shared';

export interface Connector {
  readonly kind: ConnectorKind;
  /** Fetch resources (optionally filtered by a query) to surface in context. */
  fetch(token: string, query?: string, settings?: Record<string, string>): Promise<ConnectorResource[]>;
}

/** GitHub, REST API, authenticated with a personal access token. Lists the
 *  user's most recently updated repos, or searches issues and PRs by query. */
export const githubConnector: Connector = {
  kind: 'github',
  async fetch(token, query) {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'kotrain',
    };
    if (query) {
      const res = await fetch(
        `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=20`,
        { headers },
      );
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const json: any = await res.json();
      return (json.items ?? []).map((it: any) => ({
        id: String(it.id),
        title: it.title,
        subtitle: `${it.pull_request ? 'PR' : 'Issue'} ${it.repository_url?.split('/').slice(-2).join('/') ?? ''} #${it.number}`,
        url: it.html_url,
        body: it.body ?? '',
      }));
    }
    const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=25', { headers });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const repos = (await res.json()) as any[];
    return repos.map((r) => ({
      id: String(r.id),
      title: r.full_name,
      subtitle: r.private ? 'private repo' : 'repo',
      url: r.html_url,
      body: r.description ?? '',
    }));
  },
};

/** Linear, GraphQL API, authenticated with a personal API key. */
export const linearConnector: Connector = {
  kind: 'linear',
  async fetch(token, query) {
    const gql = query
      ? { query: `query($q:String!){ searchIssues(term:$q){ nodes{ id identifier title url description } } }`, variables: { q: query } }
      : { query: `{ issues(first:25, orderBy:updatedAt){ nodes{ id identifier title url description } } }` };
    const res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify(gql),
    });
    if (!res.ok) throw new Error(`Linear ${res.status}`);
    const json: any = await res.json();
    const nodes = json.data?.issues?.nodes ?? json.data?.searchIssues?.nodes ?? [];
    return nodes.map((n: any) => ({
      id: n.id,
      title: `${n.identifier} ${n.title}`,
      subtitle: 'Linear issue',
      url: n.url,
      body: n.description ?? '',
    }));
  },
};

/** Slack, Web API, token-based. Lists channels or searches messages. */
export const slackConnector: Connector = {
  kind: 'slack',
  async fetch(token, query) {
    const url = query
      ? `https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&count=20`
      : `https://slack.com/api/conversations.list?limit=50&exclude_archived=true`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json: any = await res.json();
    if (!json.ok) throw new Error(`Slack: ${json.error ?? 'error'}`);
    if (query) {
      return (json.messages?.matches ?? []).map((m: any) => ({
        id: m.iid ?? m.ts,
        title: m.text?.slice(0, 80) ?? '(message)',
        subtitle: `#${m.channel?.name ?? ''}`,
        url: m.permalink,
        body: m.text ?? '',
      }));
    }
    return (json.channels ?? []).map((c: any) => ({
      id: c.id,
      title: `#${c.name}`,
      subtitle: c.is_private ? 'private channel' : 'channel',
      body: c.purpose?.value ?? '',
    }));
  },
};

/** Discord, bot token. Lists the bot's guilds. */
export const discordConnector: Connector = {
  kind: 'discord',
  async fetch(token) {
    const res = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) throw new Error(`Discord ${res.status}`);
    const guilds = (await res.json()) as any[];
    return guilds.map((g) => ({ id: g.id, title: g.name, subtitle: 'Discord server', body: '' }));
  },
};

/**
 * Jira Cloud REST, Basic auth (email + API token). The site URL and email ride
 * in `settings` (`site`, `email`) since the connector contract has a single
 * token slot; the token is the API token from id.atlassian.com.
 *
 * The current JQL search endpoint is `/rest/api/3/search/jql`; the legacy
 * `GET /rest/api/3/search` was removed from Jira Cloud in 2025, but we retry it
 * on 404/410 for sites that still route the old path.
 */
export const jiraConnector: Connector = {
  kind: 'jira',
  async fetch(token, query, settings) {
    const site = (settings?.site ?? '').trim().replace(/\/+$/, '');
    const email = (settings?.email ?? '').trim();
    if (!site || !email) throw new Error('Jira needs a site URL and the account email.');
    let siteUrl: URL;
    try {
      siteUrl = new URL(site);
    } catch {
      throw new Error(`Jira site "${site}" isn't a valid URL.`);
    }
    if (siteUrl.protocol !== 'https:') throw new Error('Jira site URL must be https.');
    const headers = {
      Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
      Accept: 'application/json',
    };
    // JQL reserves a swath of punctuation that can't appear inside a quoted
    // phrase (`+ - = & | > < ! ( ) { } [ ] ^ " ~ * ? : \ /`), so the term is
    // folded to plain words rather than escaped: this stays a fuzzy text
    // search, never a query-language injection point.
    const term = (query ?? '')
      .replace(/["\\]/g, ' ')
      .replace(/[+\-=&|><!(){}\[\]^~*?:/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const jql = term ? `text ~ "${term}" order by updated desc` : 'order by updated desc';
    const qs = `jql=${encodeURIComponent(jql)}&maxResults=25&fields=summary,status,issuetype,description`;
    let res = await fetch(`${site}/rest/api/3/search/jql?${qs}`, { headers });
    if (res.status === 404 || res.status === 410) {
      res = await fetch(`${site}/rest/api/3/search?${qs}`, { headers });
    }
    if (!res.ok) throw new Error(`Jira ${res.status}`);
    const json: any = await res.json();
    return (json.issues ?? []).map((issue: any) => ({
      id: String(issue.id ?? issue.key),
      title: `${issue.key} ${issue.fields?.summary ?? ''}`.trim(),
      subtitle: [issue.fields?.issuetype?.name, issue.fields?.status?.name].filter(Boolean).join(' · ') || 'Jira issue',
      url: `${site}/browse/${issue.key}`,
      body: typeof issue.fields?.description === 'string' ? issue.fields.description : '',
    }));
  },
};

/**
 * Microsoft Teams, v1. Posting goes through an incoming webhook URL
 * (`settings.webhookUrl`); reads use a pasted Microsoft Graph token. Full Graph
 * OAuth is deferred because it needs an app registration.
 *
 * The webhook is only URL-checked here: `fetch` is also "Fetch sample" in the
 * UI, so it must never post to the channel.
 */
export const teamsConnector: Connector = {
  kind: 'teams',
  async fetch(token, query, settings) {
    if (token) {
      const res = await fetch('https://graph.microsoft.com/v1.0/me/joinedTeams', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Graph ${res.status}`);
      const json: any = await res.json();
      let teams = (json.value ?? []).map((t: any) => ({
        id: t.id,
        title: t.displayName ?? 'Team',
        subtitle: 'Microsoft Teams',
        body: t.description ?? '',
      }));
      if (query) {
        const q = query.toLowerCase();
        teams = teams.filter((t: ConnectorResource) => t.title.toLowerCase().includes(q));
      }
      return teams;
    }
    const webhook = (settings?.webhookUrl ?? '').trim();
    if (webhook) {
      let u: URL;
      try {
        u = new URL(webhook);
      } catch {
        throw new Error("The Teams webhook URL isn't a valid https URL.");
      }
      // A webhook URL is a stored credential that gets POSTed to, so it has to
      // be a real Teams incoming webhook, not just any https URL: https on the
      // *.webhook.office.com host that Teams hands out for channel connectors.
      const host = u.hostname.toLowerCase();
      if (
        u.protocol !== 'https:' ||
        (host !== 'webhook.office.com' && !host.endsWith('.webhook.office.com'))
      ) {
        throw new Error(
          "The Teams webhook URL must be an https URL on *.webhook.office.com (the Incoming Webhook URL from the Teams channel).",
        );
      }
      return [
        {
          id: 'webhook',
          title: 'Incoming webhook',
          subtitle: host,
          body: 'Agent Nekko can post messages to this channel. Add a Graph token to read teams.',
        },
      ];
    }
    throw new Error('Teams needs an incoming webhook URL or a Microsoft Graph token.');
  },
};

/** Gmail / Drive use Google OAuth; wired once the OAuth flow lands in main. */
export const gmailConnector: Connector = {
  kind: 'gmail',
  async fetch(token, query) {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20${query ? `&q=${encodeURIComponent(query)}` : ''}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Gmail ${res.status}, connect via OAuth`);
    const json: any = await res.json();
    return (json.messages ?? []).map((m: any) => ({ id: m.id, title: `Message ${m.id}`, subtitle: 'Gmail', body: '' }));
  },
};

export const gdriveConnector: Connector = {
  kind: 'gdrive',
  async fetch(token, query) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?pageSize=20${query ? `&q=${encodeURIComponent(`name contains '${query}'`)}` : ''}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Drive ${res.status}, connect via OAuth`);
    const json: any = await res.json();
    return (json.files ?? []).map((f: any) => ({ id: f.id, title: f.name, subtitle: f.mimeType, body: '' }));
  },
};

export const CONNECTORS: Record<ConnectorKind, Connector> = {
  github: githubConnector,
  linear: linearConnector,
  slack: slackConnector,
  discord: discordConnector,
  jira: jiraConnector,
  teams: teamsConnector,
  gmail: gmailConnector,
  gdrive: gdriveConnector,
};

export function getConnector(kind: ConnectorKind): Connector {
  return CONNECTORS[kind];
}
