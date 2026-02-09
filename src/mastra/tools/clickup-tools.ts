import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

function getConfig() {
  const apiKey = process.env.CLICKUP_API_KEY;
  const listId = process.env.CLICKUP_LIST_ID;
  if (!apiKey) throw new Error('CLICKUP_API_KEY is not set');
  if (!listId) throw new Error('CLICKUP_LIST_ID is not set');
  return { apiKey, listId };
}

function headers(apiKey: string) {
  return {
    Authorization: apiKey,
    'Content-Type': 'application/json',
  };
}

interface ClickUpTask {
  id: string;
  name: string;
  status: { status: string };
  priority: { priority: string } | null;
  url: string;
  description?: string;
}

const TASK_STATUSES = ['to do', 'in progress', 'complete'] as const;
const statusEnum = z.enum(TASK_STATUSES);

// Priority mapping: 1=urgent, 2=high, 3=normal, 4=low
export const clickupCreateTask = createTool({
  id: 'clickup-create-task',
  description:
    'Create a new task in ClickUp. Priority: 1=urgent, 2=high, 3=normal, 4=low.',
  inputSchema: z.object({
    name: z.string().describe('Task name'),
    description: z.string().optional().describe('Task description'),
    priority: z
      .number()
      .min(1)
      .max(4)
      .optional()
      .describe('Priority: 1=urgent, 2=high, 3=normal, 4=low'),
    status: statusEnum.optional().describe('Task status: "to do", "in progress", or "complete"'),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    status: z.string(),
  }),
  execute: async (inputData) => {
    const { apiKey, listId } = getConfig();

    const body: Record<string, unknown> = { name: inputData.name };
    if (inputData.description) body.description = inputData.description;
    if (inputData.priority) body.priority = inputData.priority;
    if (inputData.status) body.status = inputData.status;

    const response = await fetch(`${CLICKUP_API_BASE}/list/${listId}/task`, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ClickUp API error (${response.status}): ${error}`);
    }

    const task = (await response.json()) as ClickUpTask;
    return {
      id: task.id,
      name: task.name,
      url: task.url,
      status: task.status.status,
    };
  },
});

export const clickupListTasks = createTool({
  id: 'clickup-list-tasks',
  description: 'List tasks from a ClickUp list. Optionally filter by status.',
  inputSchema: z.object({
    status: statusEnum.optional().describe('Filter by status: "to do", "in progress", or "complete"'),
    page: z.number().optional().describe('Page number (0-indexed)'),
  }),
  outputSchema: z.object({
    tasks: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        status: z.string(),
        priority: z.string().nullable(),
        url: z.string(),
      }),
    ),
  }),
  execute: async (inputData) => {
    const { apiKey, listId } = getConfig();

    const params = new URLSearchParams();
    if (inputData.status) params.append('statuses[]', inputData.status);
    if (inputData.page !== undefined)
      params.append('page', String(inputData.page));

    const url = `${CLICKUP_API_BASE}/list/${listId}/task${params.toString() ? `?${params}` : ''}`;
    const response = await fetch(url, { headers: headers(apiKey) });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ClickUp API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as { tasks: ClickUpTask[] };
    return {
      tasks: data.tasks.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status.status,
        priority: t.priority?.priority ?? null,
        url: t.url,
      })),
    };
  },
});

export const clickupUpdateTask = createTool({
  id: 'clickup-update-task',
  description:
    'Update an existing ClickUp task. Provide only the fields you want to change. Priority: 1=urgent, 2=high, 3=normal, 4=low.',
  inputSchema: z.object({
    taskId: z.string().describe('The ClickUp task ID to update'),
    name: z.string().optional().describe('New task name'),
    description: z.string().optional().describe('New task description'),
    priority: z
      .number()
      .min(1)
      .max(4)
      .optional()
      .describe('New priority: 1=urgent, 2=high, 3=normal, 4=low'),
    status: statusEnum.optional().describe('New task status: "to do", "in progress", or "complete"'),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    url: z.string(),
  }),
  execute: async (inputData) => {
    const { apiKey } = getConfig();

    const body: Record<string, unknown> = {};
    if (inputData.name) body.name = inputData.name;
    if (inputData.description) body.description = inputData.description;
    if (inputData.priority) body.priority = inputData.priority;
    if (inputData.status) body.status = inputData.status;

    const response = await fetch(
      `${CLICKUP_API_BASE}/task/${inputData.taskId}`,
      {
        method: 'PUT',
        headers: headers(apiKey),
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ClickUp API error (${response.status}): ${error}`);
    }

    const task = (await response.json()) as ClickUpTask;
    return {
      id: task.id,
      name: task.name,
      status: task.status.status,
      url: task.url,
    };
  },
});

export const clickupDeleteTask = createTool({
  id: 'clickup-delete-task',
  description: 'Delete a task from ClickUp by its task ID.',
  inputSchema: z.object({
    taskId: z.string().describe('The ClickUp task ID to delete'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    deletedTaskId: z.string(),
  }),
  execute: async (inputData) => {
    const { apiKey } = getConfig();

    const response = await fetch(
      `${CLICKUP_API_BASE}/task/${inputData.taskId}`,
      {
        method: 'DELETE',
        headers: headers(apiKey),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ClickUp API error (${response.status}): ${error}`);
    }

    return { success: true, deletedTaskId: inputData.taskId };
  },
});
