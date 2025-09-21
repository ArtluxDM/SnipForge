/**
 * Utility functions for handling command variables with {{variable name}} syntax
 */

/**
 * Extracts unique variable names from a command body text
 * Supports descriptive names with spaces like {{user ID}} or {{server name}}
 *
 * @param text - The command body text to extract variables from
 * @returns Array of unique variable names (without the braces)
 *
 * @example
 * extractVariables("docker exec -it {{container name}} {{command}}")
 * // Returns: ["container name", "command"]
 */
export function extractVariables(text: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g
  const variables: string[] = []
  let match

  while ((match = regex.exec(text)) !== null) {
    const variableName = match[1].trim()
    if (variableName && !variables.includes(variableName)) {
      variables.push(variableName)
    }
  }

  return variables
}

/**
 * Substitutes variables in text with provided values
 *
 * @param text - The command body text containing variables
 * @param values - Object mapping variable names to their values
 * @returns Text with variables replaced by their values
 *
 * @example
 * substituteVariables(
 *   "docker exec -it {{container}} {{command}}",
 *   { "container": "my-app", "command": "/bin/bash" }
 * )
 * // Returns: "docker exec -it my-app /bin/bash"
 */
export function substituteVariables(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
    const variableName = variable.trim()
    return values[variableName] || match // Keep original if no value provided
  })
}

/**
 * Checks if a text contains any variables
 *
 * @param text - The text to check
 * @returns True if the text contains at least one variable
 *
 * @example
 * hasVariables("ls -la") // Returns: false
 * hasVariables("docker logs {{container}}") // Returns: true
 */
export function hasVariables(text: string): boolean {
  return /\{\{[^}]+\}\}/.test(text)
}

/**
 * Type definition for variable values
 */
export interface VariableValues {
  [variableName: string]: string
}