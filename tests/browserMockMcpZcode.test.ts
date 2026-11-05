import { expect, test } from 'bun:test';
import { createBrowserMockRuntime } from '../src/mocks/browserMockRuntime';

test('browser mock round-trips MCP and ZCode settings without sharing caller objects', async () => {
  const runtime = createBrowserMockRuntime('empty');
  const server = { id: 'sample', name: 'Sample', transport: 'stdio', command: 'demo', args: [], env: {}, url: null, headers: {}, enabled: true, description: null };
  await runtime.invoke('save_mcp_server', { server });
  server.name = 'Changed outside mock';
  await runtime.invoke('set_mcp_server_enabled', { id: 'sample', enabled: false });
  expect(await runtime.invoke('list_mcp_servers')).toMatchObject([{ name: 'Sample', enabled: false }]);
  expect(JSON.parse(await runtime.invoke('export_mcp_servers_json') as string).mcpServers.Sample.command).toBe('demo');
  await runtime.invoke('delete_mcp_server', { id: 'sample' });
  expect(await runtime.invoke('list_mcp_servers')).toEqual([]);
  expect(await runtime.invoke('import_mcp_servers_json', { raw: '{"mcpServers":{"Imported":{"command":"npx","args":["demo"]}}}' })).toMatchObject({ added: 1, errors: [] });
  expect(await runtime.invoke('list_mcp_servers')).toMatchObject([{ name: 'Imported', command: 'npx' }]);
  expect(await runtime.invoke('list_skills')).toEqual([]);
  expect(await runtime.invoke('open_mcp_skills_directory')).toBeNull();
  expect(await runtime.invoke('list_update_channels')).toContain('stable');
  const catalog = { models: [], modelOrder: ['custom'] };
  await runtime.invoke('save_zcode_model_catalog_editor', { request: catalog });
  catalog.modelOrder.push('outside');
  expect(await runtime.invoke('get_zcode_model_catalog_editor')).toMatchObject({ modelOrder: ['custom'], configured: true });
  const subagents = { defaultSubagentModel: 'custom', defaultThoughtLevel: 'high', subagents: [] };
  await runtime.invoke('save_zcode_subagent_config', { request: subagents });
  expect(await runtime.invoke('get_zcode_subagent_config')).toEqual(subagents);
});
