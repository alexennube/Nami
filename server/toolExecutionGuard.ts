/**
 * Validation and guard functions to prevent empty tool name execution errors
 */

/**
 * Validates that a tool name is not empty or null
 * @param name - The tool name to validate
 * @returns true if valid, false otherwise
 */
export function isValidToolName(name: string | null | undefined): boolean {
  if (!name) return false;
  if (typeof name !== 'string') return false;
  if (name.trim() === '') return false;
  return true;
}

/**
 * Safely executes a tool with validation
 * @param name - The tool name
 * @param args - Tool arguments
 * @returns Execution result or error message
 */
export async function safeExecuteTool(name: string, args: Record<string, any>): Promise<string> {
  // Additional safety check for empty strings
  if (typeof name === 'string' && name.trim() === '') {
    return "Error: Empty tool name provided. Tool name must be a non-empty string.";
  }
  
  if (!isValidToolName(name)) {
    return `Error: Invalid tool name provided. Expected a non-empty string, got: ${typeof name === 'string' ? `'${name}'` : String(name)}`;
  }
  
  // Import here to avoid circular dependencies
  const { executeToolCall } = await import('./tools');
  return executeToolCall(name, args);
}

/**
 * Guard function to validate tool calls before processing
 * @param toolCall - Tool call object with name and arguments
 * @returns Validated tool call data or error message
 */
export function validateToolCall(toolCall: { name?: string; arguments?: Record<string, any> }): { isValid: boolean; name?: string; args?: Record<string, any>; error?: string } {
  if (!toolCall) {
    return { isValid: false, error: "Invalid tool call structure: null or undefined" };
  }

  const name = toolCall.name;
  const args = toolCall.arguments || {};
  
  if (!name) {
    return { isValid: false, error: "Tool call missing name property" };
  }
  
  if (typeof name !== 'string') {
    return { isValid: false, error: `Tool name must be a string, got ${typeof name}` };
  }
  
  if (name.trim() === '') {
    return { isValid: false, error: "Tool name cannot be empty or whitespace-only" };
  }

  // Additional safety checks
  if (args && typeof args !== 'object') {
    return { isValid: false, error: "Tool arguments must be an object or undefined" };
  }
  
  return { isValid: true, name, args };
}