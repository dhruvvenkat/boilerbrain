# AGENTS.md

## Project Overview
BoilerBrain is a CLI tool that converts natural-language software ideas into structured starter boilerplate for backend projects.

The v1 pipeline is:

1. parse user prompt
2. generate structured spec
3. generate architecture plan
4. scaffold project files
5. generate starter code
6. generate starter tests
7. output a validation checklist

This repository prioritizes clarity, modularity, and structured AI-assisted development over feature breadth.

## Source of Truth
- Follow `PRD.md` for product requirements and scope
- Follow `README.md` for public project description and usage
- If there is a conflict, prefer `PRD.md` for product behavior and this file for implementation behavior

## Tech Stack
- TypeScript
- Node.js
- CLI-first architecture
- Minimal dependencies unless clearly justified

## Engineering Principles
- Prefer simple, modular code over clever abstractions
- Keep functions focused and easy to test
- Use explicit types/interfaces for pipeline data
- Optimize for readability and maintainability
- Build the smallest correct version first

## Scope Rules
- Implement only the requested feature or task
- Do not silently expand scope
- Do not add future-facing abstractions unless they clearly support the current task
- For ambiguous requirements, choose the simplest implementation consistent with `PRD.md`

## File and Architecture Rules
- Keep pipeline stages separated by responsibility
- Avoid mixing CLI logic, generation logic, and filesystem logic in the same module
- Prefer creating small focused modules instead of large all-in-one files
- Do not rename or reorganize project structure unless required by the task

## Dependency Rules
- Do not add dependencies unless necessary
- Prefer built-in Node.js functionality where reasonable
- If adding a dependency, explain why it is needed

## Code Style Rules
- Use clear naming
- Avoid deeply nested logic where possible
- Avoid dead code, placeholder complexity, or unnecessary wrappers
- Add comments only when they clarify non-obvious decisions
- Do not over-comment obvious code

## Testing and Validation
- Add tests for meaningful logic when relevant
- Prefer lightweight, focused tests
- Validate generated code paths where possible
- Ensure the code compiles and passes relevant checks before finishing

## Output Expectations
When completing a task:
1. Summarize what changed
2. List files created or modified
3. Mention assumptions made
4. Mention any follow-up work that remains
5. Do not claim features were implemented if they are only stubbed

## Anti-Patterns to Avoid
- giant multi-purpose files
- unnecessary abstractions
- vague placeholder implementations presented as complete
- silently changing unrelated files
- adding complexity before the MVP works

## v1 Priority
For v1, prioritize:
- working CLI flow
- clean pipeline interfaces
- simple structured outputs
- boilerplate generation for backend starter projects

Do not prioritize:
- advanced autonomy
- full production readiness
- support for many frameworks
- frontend generation unless explicitly requested