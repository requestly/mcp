<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->


# MCP Server Project – Copilot Coding Instructions

This project implements a Model Context Protocol (MCP) server for Requestly automation. Reference:
- MCP protocol: https://modelcontextprotocol.io/llms-full.txt
- Python SDK: https://github.com/modelcontextprotocol/create-python-server

## General Guidelines

- Use TypeScript and Zod for all schema validation and type safety.
- Keep all rule schemas up to date in `/src/types/ruleSchemas.ts`. This is the single source of truth for rule types and payload structures.
- Always validate incoming and outgoing payloads against the discriminated union schema (`ruleSchema`).
- When adding new rule types, follow the discriminated union pattern and update all relevant schemas and mappings.

## Requestly Rule Schema Requirements

- For all rules:
  - The `pairs` array must match the schema for the given `ruleType`.
  - Only include fields required by the Requestly API; omit extraneous properties.

## Project Structure

- `/src/types/ruleSchemas.ts`: All Zod schemas for rule types.
- `/src/tools/createRule.ts`: Main handler for rule creation and payload mapping.
- `/testCreateRule.js`, `/testMockResponseRule.js`: Standalone test scripts for direct API testing.
- `/build/`: Compiled output.

## Contribution

- Follow the schema and validation patterns established in the project.
- Update documentation and instructions when making changes to rule schemas or API integration.

---
For any schema or API compatibility issues, always start by reviewing `/src/types/createRuleSchemas.ts` and the latest Requestly API requirements.
