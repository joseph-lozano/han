---
name: "architectural-analysis"
description: "Performs deep architectural analysis of a specified module, directory, or feature area by examining structural coupling, data flow, concurrency patterns, risk, and SOLID alignment. Use when the user wants to assess, evaluate, or review the architecture, design quality, dependency structure, coupling, cohesion, or technical debt of an existing part of the codebase — including requests to audit module boundaries, check for architectural smells, or inform refactoring decisions. Requires a specific focus area (module, directory, or component) to analyze. Not for creating new project structures, scaffolding, or boilerplates. Not for investigating specific bugs, runtime errors, or failures — use investigate. Not for test planning — use test-planning. Not for file-level code review — use code-review. Not for writing documentation or architectural decision records."
argument-hint: "[focus area: module, directory, or feature to analyze]"
allowed-tools: Read, Glob, Grep, Agent, Bash(git *), Bash(find *)
---

## Pi Compatibility

When this skill runs under Pi, apply [Pi compatibility](../../references/pi-compatibility.md): use Pi's `subagent(...)` tool for every instruction that says to launch an `Agent` tool call, and use parallel `tasks` for swarm launches.


## Project Context

- CLAUDE.md: !`find . -maxdepth 1 -name "CLAUDE.md" -type f`
- project-discovery.md: !`find . -maxdepth 3 -name "project-discovery.md" -type f`

# Architectural Analysis

A focus area is required. The user must specify a module, directory, or feature to analyze. If no focus area was provided, ask the user to specify one before proceeding.

## Step 1: Validate the Focus Area

Confirm the specified module, directory, or files exist using Glob and Read. Identify the boundaries of the focus area — what files and directories it includes.

If the focus area does not resolve to actual files, stop and ask the user to clarify.

## Step 2: Dispatch Analysis Agents in Parallel

Launch three agents simultaneously, each given the focus area to analyze:

1. Launch a `structural-analyst` agent to analyze static structure — module boundaries, coupling, dependency direction, abstractions, and duplication patterns within the focus area.

2. Launch a `behavioral-analyst` agent to analyze runtime behavior — data flow, error propagation, state management, and integration boundaries within the focus area.

3. Launch a `concurrency-analyst` agent to detect and analyze concurrency and async patterns — race conditions, shared resource contention, deadlock potential, and async error handling within the focus area.

All three agents run in parallel. Wait for all three to complete before proceeding.

## Step 3: Compile Analysis Results

After all three agents complete, compile their findings into a unified analysis summary. Collect all numbered items (S1-SN from structural, B1-BN from behavioral, C1-CN from concurrency) preserving the full verbatim output from each agent.

## Step 4: Dispatch Risk Analyst

Launch a `risk-analyst` agent. Pass it the full verbatim output from all three analysis agents. The risk analyst assesses likelihood, severity, blast radius, and reversibility for each finding, producing numbered risk items (R1-RN) that cross-reference the upstream findings.

Wait for the risk analyst to complete before proceeding.

## Step 5: Dispatch Software Architect

Launch a `software-architect` agent. Pass it the full verbatim output from all analysis agents AND the risk analyst. The architect produces recommended intra-codebase architectural changes aligned with high cohesion, loose coupling, and SOLID principles, with pseudocode sketches for proposed modules, interfaces, and boundaries *inside* the focus area.

If the architect's output lists any findings deferred to `system-architect` (concerns that cross a service boundary, a bounded-context seam, or a trust boundary), surface those in the final report under a "System-level concerns deferred" subsection. The user can then dispatch `system-architect` separately if they want recommendations at that altitude; this skill operates at software-architecture altitude by design.

Wait for the software architect to complete before proceeding.

## Step 6: Produce Final Report

Assemble the final report with all sections. Present it directly in the conversation. Each analysis section below includes the corresponding agent's full verbatim output.

### Executive Summary

Write a brief executive summary covering:
- The focus area that was analyzed
- The 3-5 most critical findings across all analysis dimensions
- The highest-impact architectural recommendations
- Any dimensions that found no issues (concurrency patterns not present, etc.)

### Structural Analysis

### Behavioral Analysis

### Concurrency Analysis

### Risk Assessment

### Software-Architecture Recommendations

### System-level concerns deferred (if any)
