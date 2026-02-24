/**
 * Validates that tool names are not empty before execution
 */
export const validateToolName = (toolName: string): boolean => {
  if (!toolName || typeof toolName !== 'string' || toolName.trim() === '') {
    console.error('Invalid tool name provided. Tool name must be a non-empty string.');
    return false;
  }
  return true;
};

/**
 * Safe tool executor that validates tool names before execution
 */
export const safeExecuteTool = (toolName: string, args: Record<string, any>) => {
  if (!validateToolName(toolName)) {
    throw new Error(`Cannot execute tool with invalid name: "${toolName}"`);
  }
  
  // Proceed with normal tool execution logic here
  // This is a placeholder for actual tool execution
  console.log(`Executing tool: ${toolName} with args:`, args);
  return { success: true, toolName };
};