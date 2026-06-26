import type { ToolSpec } from '../providers/types.js';

/**
 * The built-in agent toolset. These specs are sent to the model; the actual
 * execution lives in the host (Electron main) so that filesystem/shell access
 * passes through the sandbox + guardrails layer.
 */
export const BUILTIN_TOOLS: ToolSpec[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file at an absolute or workspace-relative path.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a file with the given contents.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Replace an exact string in a file with a new string.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string', description: 'Exact text to replace (must be unique).' },
        new_string: { type: 'string' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'glob',
    description: 'Find files matching a glob pattern within the workspace.',
    parameters: {
      type: 'object',
      properties: { pattern: { type: 'string', description: 'e.g. src/**/*.ts' } },
      required: ['pattern'],
    },
  },
  {
    name: 'grep',
    description: 'Search file contents with a regular expression.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string', description: 'Optional directory to scope the search.' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'list_dir',
    description: 'List the entries of a directory.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'bash',
    description:
      'Run a shell command in the workspace. Subject to guardrails — risky commands require user approval.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        cwd: { type: 'string', description: 'Optional working directory.' },
      },
      required: ['command'],
    },
  },
  {
    name: 'spawn_agent',
    description:
      'Delegate a self-contained sub-task to a fresh sub-agent that works in the same project with its own context, then returns its final answer. Use for parallelizable or well-scoped work (e.g. "investigate X", "implement Y in file Z"). The sub-agent appears as a nested tab in the workbench.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short label for the sub-agent tab.' },
        task: { type: 'string', description: 'The full, standalone instruction for the sub-agent.' },
      },
      required: ['task'],
    },
  },
];
