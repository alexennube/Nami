/**
 * Validates tool names to prevent empty string execution
 */
export const validateToolName = (toolName: string): boolean => {
  if (!toolName || typeof toolName !== 'string') {
    return false;
  }
  return toolName.trim().length > 0;
};

/**
 * Wrapper for tool execution that validates tool names
 */
export const safeToolExecution = (toolName: string, executeFn: () => any) => {
  if (!validateToolName(toolName)) {
    throw new Error(`Invalid tool name provided. Tool name must be a non-empty string. Received: "${toolName}"`);
  }
  return executeFn();
};