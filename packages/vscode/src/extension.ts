/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { AgentManager } from './agent-manager';
import { ChatPanelProvider } from './chat-panel';
import { IDEServer } from './ide-server';

let agentManager: AgentManager;
let chatPanelProvider: ChatPanelProvider;
let ideServer: IDEServer;
let logger: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
  logger = vscode.window.createOutputChannel('Gemini Agent');
  logger.show();
  logger.appendLine('Starting Gemini Agent extension...');

  try {
    // Initialize Agent Manager
    agentManager = new AgentManager(context, logger);
    await agentManager.initialize();
    logger.appendLine('Agent Manager initialized');

    // Create Chat Panel Provider
    chatPanelProvider = new ChatPanelProvider(context, agentManager, logger);
    
    // Register the webview provider
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        ChatPanelProvider.viewType,
        chatPanelProvider
      )
    );
    logger.appendLine('Chat panel provider registered');

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('gemini-agent.newChat', () => {
        chatPanelProvider.newChat();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gemini-agent.clearChat', () => {
        chatPanelProvider.clearChat();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gemini-agent.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'gemini-agent');
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gemini-agent.reinitialize', async () => {
        try {
          await agentManager.reinitialize();
          vscode.window.showInformationMessage('Gemini Agent reinitialized successfully!');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Failed to reinitialize: ${message}`);
        }
      })
    );

    // Keep the existing IDE server for backward compatibility with CLI
    ideServer = new IDEServer(logger);
    await ideServer.start(context);
    logger.appendLine('IDE server started for CLI compatibility');

    logger.appendLine('Gemini Agent extension activated successfully');

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.appendLine(`Failed to activate extension: ${message}`);
    vscode.window.showErrorMessage(`Failed to activate Gemini Agent: ${message}`);
  }
}

export function deactivate() {
  logger.appendLine('Deactivating Gemini Agent extension...');
  
  const promises: Promise<void>[] = [];
  
  if (agentManager) {
    agentManager.dispose();
  }
  
  if (ideServer) {
    promises.push(ideServer.stop());
  }
  
  return Promise.all(promises).finally(() => {
    if (logger) {
      logger.dispose();
    }
  });
}
