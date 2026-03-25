# BoilerBrain
## Project Overview
BoilerBrain is a terminal-based application that helps developers streamline the first steps of building  a software project by generating project scaffolds, as well as boilerplate code directly in the project folder. Ultimately, the goal is to mitigate the amount of time spent spinning up boilerplate code so that engineers can focus their bandwidth on architecture and innovating.

## Problem Statement
Often, the first idea of a project is very vague

> "Generate me a calendar application with authentication"

> "Build me a todo API with built-in authentication"

In this state, it is impossible to build software because several things haven't been defined:

 - System requirements
 - Architecture
 - Setup of the actual project folder
 - Writing boilerplate endpoints
 - Spinning up starter unit tests

The core issue is that there doesn't exist a core pipeline to convert vague requirements directly into a clean and validated starter project that a developer can start building inside.

## Goals
- Convert natural language project descriptions into a structured set of specifications
- Generate a basic yet consistent project architecture
- Automatically build a project scaffold containing all required folders, code files, and documents
- Fill in any boilerplate code (starter code for code files, endpoints, etc.)
- Comments to guide the user through your architectural decisions

## Target Audience
Developers working on backend projects who want to eliminate the setup time for said projects.

## Program Flow

```
Developer has idea
		
Developer inputs idea to TUI

Program generates a project spec

Program generates an architectural plan
		
Project scaffold + empty files are created

Boilerplate code is generated

Generate validation tests

Run validation tests

Return a summary of all boilerplate code generated, as well as high-level overview of architectural plan
```

## Core Features
1. Generate the project spec in a structured file called spec.json
2. Generate a deep-dive into the architectural decisions in a file called architecture.json. Every major design choice should be stated and justified, with alternatives given.
3. Project scaffold should be generated based on the recommended tech stack, eg:
	`src\
	 routes\
	 services\
	 tests\`    
4. Once the boilerplate and starter endpoints are generated, build and run a suite of unit tests to ensure that everything is hooked up properly. If errors occur, take any actions required to address them
5. Generate a validation checklist that the developer can review after the program has run in order to see what it did

## MVP Scope
MVP should support:
 - CLI interface
 - Node.js/TypeScript project generation
 - REST API scaffolding
 - Jest test generation

MVP should not include:
 - Detailed TUI
 - Database integration/support
 - Conversation with the agent following inital generation
 - Deployment automation
 - Frontend generation

## Architecture Overview
CLI --> Pipeline Controller --> LLM Client --> Project Generation (spec module, architecture module, code generation) --> Project Building (editing directly within the repo) --> Test Generation and Execution --> Validation Checklist and Summary of Changes	 
