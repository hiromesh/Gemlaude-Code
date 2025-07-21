/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { AgentManager, ChatMessage, AgentSession } from './agent-manager';

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'gemini-agent-chat';

  private _view?: vscode.WebviewView;
  private agentManager: AgentManager;
  private logger: vscode.OutputChannel;

  constructor(
    private readonly context: vscode.ExtensionContext,
    agentManager: AgentManager,
    logger: vscode.OutputChannel
  ) {
    this.agentManager = agentManager;
    this.logger = logger;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.context.extensionUri
      ]
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      async (data) => {
        switch (data.type) {
          case 'sendMessage':
            await this.handleSendMessage(data.message);
            break;
          case 'newChat':
            await this.handleNewChat();
            break;
          case 'clearChat':
            await this.handleClearChat();
            break;
          case 'ready':
            // Webview is ready, send initial state
            await this.sendCurrentSession();
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );
  }

  private async handleSendMessage(message: string): Promise<void> {
    if (!message.trim()) {
      return;
    }

    this.logger.appendLine(`Handling message: ${message}`);

    try {
      // Ensure we have an active session
      if (!this.agentManager.getCurrentSession()) {
        this.logger.appendLine('Creating new session...');
        await this.agentManager.createNewSession();
      }

      // Send user message to webview immediately
      this._view?.webview.postMessage({
        type: 'userMessage',
        message: {
          id: `user_${Date.now()}`,
          role: 'user',
          content: message,
          timestamp: new Date().toISOString()
        }
      });

      // Show thinking indicator
      this.logger.appendLine('Showing thinking indicator...');
      this._view?.webview.postMessage({
        type: 'thinking',
        thinking: true
      });

      // Send message to agent
      this.logger.appendLine('Sending message to agent...');
      const response = await this.agentManager.sendMessage(message);
      this.logger.appendLine(`Received response: ${response.content}`);

      // Hide thinking indicator
      this.logger.appendLine('Hiding thinking indicator...');
      this._view?.webview.postMessage({
        type: 'thinking',
        thinking: false
      });

      // Send assistant response to webview
      this._view?.webview.postMessage({
        type: 'assistantMessage',
        message: {
          id: response.id,
          role: response.role,
          content: response.content,
          timestamp: response.timestamp.toISOString(),
          toolCalls: response.toolCalls
        }
      });

      this.logger.appendLine('Message handling completed successfully');

    } catch (error) {
      this.logger.appendLine(`Error in handleSendMessage: ${error}`);
      
      // Hide thinking indicator
      this._view?.webview.postMessage({
        type: 'thinking',
        thinking: false
      });

      // Send error message
      this._view?.webview.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error)
      });

      this.logger.appendLine(`Error handling message: ${error}`);
    }
  }

  private async handleNewChat(): Promise<void> {
    try {
      const session = await this.agentManager.createNewSession();
      this._view?.webview.postMessage({
        type: 'newSession',
        session: {
          id: session.id,
          messages: [],
          workspaceRoot: session.workspaceRoot
        }
      });
    } catch (error) {
      this.logger.appendLine(`Error creating new chat: ${error}`);
    }
  }

  private async handleClearChat(): Promise<void> {
    this.agentManager.clearCurrentSession();
    this._view?.webview.postMessage({
      type: 'clearChat'
    });
  }

  private async sendCurrentSession(): Promise<void> {
    const session = this.agentManager.getCurrentSession();
    if (session) {
      this._view?.webview.postMessage({
        type: 'currentSession',
        session: {
          id: session.id,
          messages: session.messages.map(msg => ({
            ...msg,
            timestamp: msg.timestamp.toISOString()
          })),
          workspaceRoot: session.workspaceRoot
        }
      });
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'media', 'main.css'));

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${styleUri}" rel="stylesheet">
        <title>Gemini Agent</title>
      </head>
      <body>
        <div id="app">
          <div id="chat-container">
            <div id="messages"></div>
            <div id="thinking" class="thinking hidden">
              <div class="thinking-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span>Thinking...</span>
            </div>
          </div>
          <div id="input-container">
            <div class="input-wrapper">
              <textarea id="message-input" placeholder="Ask Gemini Agent anything..." rows="1"></textarea>
              <div class="input-actions">
                <button id="send-button" title="Send message">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1.724 1.053a.5.5 0 0 0-.714.545l1.403 4.85a.5.5 0 0 0 .397.354l5.69.953a.125.125 0 0 1 0 .245l-5.69.953a.5.5 0 0 0-.397.354l-1.403 4.85a.5.5 0 0 0 .714.545l13-6.5a.5.5 0 0 0 0-.894l-13-6.5z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }

  public newChat(): void {
    this.handleNewChat();
  }

  public clearChat(): void {
    this.handleClearChat();
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
