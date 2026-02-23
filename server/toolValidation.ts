/**
 * Validates that tool names are properly defined and not empty
 */
export function validateToolName(toolName: string | undefined | null): boolean {
  // Check if tool name is provided and not empty
  if (!toolName || typeof toolName !== 'string' || toolName.trim() === '') {
    return false;
  }
  
  // Additional safety check - ensure it doesn't have invalid characters
  const validToolNameRegex = /^[a-zA-Z0-9_-]+$/;
  return validToolNameRegex.test(toolName);
}

/**
 * Sanitizes and validates tool names to prevent empty tool name executions
 */
export function sanitizeToolName(toolName: string | undefined | null): string | null {
  // Return null for invalid tool names
  if (!validateToolName(toolName)) {
    return null;
  }
  
  return toolName.trim();
}