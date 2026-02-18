# GitHub Copilot Instructions for GridScout

## Project Overview

GridScout is a Discord bot project written in TypeScript. It includes bot logic, command handling, data parsing, and web views. The project is structured for modularity and maintainability.

## Coding Guidelines

- Use TypeScript for all source files in `src/`.
- Prefer ES6+ features (async/await, arrow functions, destructuring).
- Keep code modular: one class/function per file where possible.
- Use clear, descriptive names for variables, functions, and classes.
- Add JSDoc comments for exported functions and classes.
- Handle errors gracefully, especially in bot commands and listeners.

## Directory Structure

- `src/`: Main bot source code
  - `commands/`: Individual command modules
  - `listeners/`: Discord event listeners
  - Other files: Core bot logic, data models, utilities
- `views/`: EJS templates for web views
- `public/`: Static assets
- `install/`: Deployment files

## Bot Development

- All bot commands should be defined in `src/commands/`.
- Event listeners go in `src/listeners/`.
- Use Discord.js v14+ conventions.
- Register commands and listeners in `Bot.ts` or `Server.ts`.

## Data Handling

- Use TypeScript interfaces for data models (e.g., `ScoutEntry`, `PilotSighting`).
- Parse and validate incoming messages in `MessageParser.ts`.

## Web Views

- Use EJS templates in `views/` for rendering web pages.
- Keep logic out of templates; use controller files in `src/`.

## Testing & Build

- Run `npm run build` to compile TypeScript.
- Add tests in a `tests/` folder if needed.

## Copilot Usage

- Suggest code that follows the above structure and guidelines.
- When generating new commands or listeners, place them in the correct subfolder.
- Prefer TypeScript types and interfaces for all new code.
- Add comments and documentation to generated code.
- Avoid hardcoding values; use configuration or environment variables where possible.

## Example Command Skeleton

```ts
import { CommandInteraction } from "discord.js";

export default {
  name: "example",
  description: "An example command",
  execute: async (interaction: CommandInteraction) => {
    // ...command logic...
  },
};
```

## Example Listener Skeleton

```ts
import { Client } from "discord.js";

export default (client: Client) => {
  client.on("eventName", async (event) => {
    // ...listener logic...
  });
};
```

## Contact

For questions, see README.md or contact the project maintainer.

## Listening, Logging, and Web Serving

GridScout continuously listens for updates, including messages and interactions. Updates originate from the GridScout client app or a library in EveCommander (both are separate projects). These updates are processed by event listeners and message parsers, and relevant information is logged using TypeScript data models such as `ScoutEntry` and `PilotSighting`. The bot maintains a persistent log of updates and sightings, ensuring data integrity and traceability.

Logged data is used to generate reports and is made accessible through web pages served by the bot. Web views, rendered with EJS templates, display information about the logged data, including update logs and detailed reports. The web interface is kept up-to-date with the latest data, providing users with real-time access to information collected by the bot.

When contributing code, ensure that:

- Listeners and parsers handle updates efficiently and robustly.
- Logging mechanisms maintain accurate and complete records.
- Web views reflect the current state of logged data and are updated as new information is processed.
