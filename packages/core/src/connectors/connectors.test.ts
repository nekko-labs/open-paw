import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { CONNECTORS, getConnector, jiraConnector, teamsConnector } from './index.js';

describe('jira connector', () => {
  let fetchMock: Mock;
  const settings = { site: 'https://team.atlassian.net/', email: 'me@co.com' };

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;
  });

  it('searches issues with Basic auth against the site URL', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          issues: [
            {
              id: '10001',
              key: 'ENG-12',
              fields: {
                summary: 'Fix the thing',
                issuetype: { name: 'Bug' },
                status: { name: 'In Progress' },
                description: 'details',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const res = await jiraConnector.fetch('api-token', 'login', settings);
    const [url, init] = fetchMock.mock.calls[0];
    // The site URL's trailing slash is stripped and the current JQL endpoint is used.
    expect(String(url)).toContain('https://team.atlassian.net/rest/api/3/search/jql?');
    expect(String(url)).toContain('jql=');
    expect((init as any).headers.Authorization).toBe(
      `Basic ${Buffer.from('me@co.com:api-token').toString('base64')}`,
    );
    expect(res).toEqual([
      {
        id: '10001',
        title: 'ENG-12 Fix the thing',
        subtitle: 'Bug · In Progress',
        url: 'https://team.atlassian.net/browse/ENG-12',
        body: 'details',
      },
    ]);
  });

  it('falls back to the legacy search endpoint when the new one is gone', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('gone', { status: 410 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ issues: [] }), { status: 200 }));
    const res = await jiraConnector.fetch('api-token', undefined, settings);
    expect(res).toEqual([]);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/rest/api/3/search?');
  });

  it('rejects a missing or non-https site before any request', async () => {
    await expect(jiraConnector.fetch('t', undefined, { site: '', email: 'a@b.c' })).rejects.toThrow('site URL');
    await expect(jiraConnector.fetch('t', undefined, { site: 'http://x', email: 'a@b.c' })).rejects.toThrow('https');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('teams connector', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;
  });

  it('lists joined teams with a Graph token and filters by query', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          value: [
            { id: 't1', displayName: 'Platform', description: 'platform team' },
            { id: 't2', displayName: 'Sales', description: '' },
          ],
        }),
        { status: 200 },
      ),
    );
    const all = await teamsConnector.fetch('graph-token', undefined, { webhookUrl: 'https://x' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://graph.microsoft.com/v1.0/me/joinedTeams');
    expect((init as any).headers.Authorization).toBe('Bearer graph-token');
    expect(all.map((t) => t.title)).toEqual(['Platform', 'Sales']);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ value: [{ id: 't1', displayName: 'Platform' }, { id: 't2', displayName: 'Sales' }] }), { status: 200 }),
    );
    const filtered = await teamsConnector.fetch('graph-token', 'plat');
    expect(filtered.map((t) => t.title)).toEqual(['Platform']);
  });

  it('describes a webhook-only connection without posting to it', async () => {
    const res = await teamsConnector.fetch('', undefined, { webhookUrl: 'https://acme.webhook.office.com/abc' });
    expect(fetchMock).not.toHaveBeenCalled(); // reads never POST to the channel
    expect(res).toHaveLength(1);
    expect(res[0].subtitle).toBe('acme.webhook.office.com');
  });

  it('rejects a malformed webhook and an empty connection', async () => {
    await expect(teamsConnector.fetch('', undefined, { webhookUrl: 'not a url' })).rejects.toThrow('valid https');
    await expect(teamsConnector.fetch('', undefined, {})).rejects.toThrow('webhook URL or a Microsoft Graph token');
  });

  it('rejects webhook URLs that are not Teams incoming webhooks', async () => {
    await expect(
      teamsConnector.fetch('', undefined, { webhookUrl: 'https://example.com/hook' }),
    ).rejects.toThrow('webhook.office.com');
    await expect(
      teamsConnector.fetch('', undefined, { webhookUrl: 'https://evilwebhook.office.com.evil.net/x' }),
    ).rejects.toThrow('webhook.office.com');
    await expect(
      teamsConnector.fetch('', undefined, { webhookUrl: 'http://acme.webhook.office.com/abc' }),
    ).rejects.toThrow('webhook.office.com');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('connector registry', () => {
  it('covers every kind in the catalog', () => {
    for (const kind of ['github', 'linear', 'slack', 'discord', 'jira', 'teams', 'gmail', 'gdrive'] as const) {
      expect(getConnector(kind).kind).toBe(kind);
      expect(CONNECTORS[kind]).toBeDefined();
    }
  });
});
