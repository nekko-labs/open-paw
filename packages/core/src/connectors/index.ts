import type { ConnectorKind, ConnectorResource } from '@open-paw/shared';

export interface Connector {
  readonly kind: ConnectorKind;
  /** Fetch resources (optionally filtered by a query) to surface in context. */
  fetch(token: string, query?: string, settings?: Record<string, string>): Promise<ConnectorResource[]>;
}

/** Linear — GraphQL API, authenticated with a personal API key. */
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

/** Slack — Web API, token-based. Lists channels or searches messages. */
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

/** Discord — bot token. Lists the bot's guilds. */
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

/** Gmail / Drive use Google OAuth; wired once the OAuth flow lands in main. */
export const gmailConnector: Connector = {
  kind: 'gmail',
  async fetch(token, query) {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20${query ? `&q=${encodeURIComponent(query)}` : ''}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Gmail ${res.status} — connect via OAuth`);
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
    if (!res.ok) throw new Error(`Drive ${res.status} — connect via OAuth`);
    const json: any = await res.json();
    return (json.files ?? []).map((f: any) => ({ id: f.id, title: f.name, subtitle: f.mimeType, body: '' }));
  },
};

export const CONNECTORS: Record<ConnectorKind, Connector> = {
  linear: linearConnector,
  slack: slackConnector,
  discord: discordConnector,
  gmail: gmailConnector,
  gdrive: gdriveConnector,
};

export function getConnector(kind: ConnectorKind): Connector {
  return CONNECTORS[kind];
}
