/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import OpenAI from 'openai';
import { spawn } from 'child_process';
import * as path from 'path';

// Simplified interfaces for VSCode extension integration
interface ContentGenerator {
  generateContent(params: any): Promise<any>;
}

interface Config {
  getContentGeneratorConfig(): any;
  setContentGeneratorConfig(config: any): void;
}

interface ToolRegistry {
  initialize(config: Config): Promise<void>;
  getTools(): Promise<any[]>;
}

// Simple implementations
class SimpleConfig implements Config {
  private config: any = {};
  
  getContentGeneratorConfig() {
    return this.config;
  }
  
  setContentGeneratorConfig(config: any) {
    this.config = config;
  }
}

class SimpleToolRegistry implements ToolRegistry {
  async initialize(config: Config): Promise<void> {
    // TODO: Implement tool registry initialization
  }
  
  async getTools(): Promise<any[]> {
    // TODO: Return available tools
    return [];
  }
}

class SimpleContentGenerator implements ContentGenerator {
  async generateContent(params: any): Promise<any> {
    console.log('SimpleContentGenerator: generateContent called with:', params);
    
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const response = {
      content: "🤖 This is a placeholder response from the Gemini Agent. The actual Gemini integration will be implemented next. Your message was: \"" + (params.messages?.[params.messages.length - 1]?.content || 'unknown') + "\"",
      toolCalls: []
    };
    
    console.log('SimpleContentGenerator: returning response:', response);
    return response;
  }
}

class OpenAIContentGenerator implements ContentGenerator {
  private openai: OpenAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: {
    apiKey: string;
    baseURL?: string;
    organization?: string;
    model: string;
    maxTokens: number;
    temperature: number;
  }) {
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      organization: config.organization,
    });
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;
  }

  async generateContent(params: any): Promise<any> {
    console.log('OpenAIContentGenerator: generateContent called with:', params);
    
    try {
      // Convert messages to OpenAI format
      const messages = params.messages?.map((msg: any) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      })) || [];

      console.log('OpenAI request:', {
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature
      });

      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
      });

      const response = {
        content: completion.choices[0]?.message?.content || 'No response generated',
        toolCalls: [] // TODO: Add tool calling support later
      };

      console.log('OpenAIContentGenerator: returning response:', response);
      return response;
    } catch (error) {
      console.error('OpenAI API error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: `❌ OpenAI API Error: ${errorMessage}`,
        toolCalls: []
      };
    }
  }
}

// Gemini CLI content generator using IPC to communicate with CLI process
class GeminiCLIContentGenerator implements ContentGenerator {
  private cliPath: string;
  private userConfig: any;

  constructor() {
    // Path to the Gemini CLI executable (compiled from gemini.tsx)
    // CLI path - use correct entry point
    this.cliPath = '/Users/hiro/Gemlaude-Code/packages/cli/dist/index.js'; // TODO 路径不能写死
  }

  async initialize(userConfig: any): Promise<void> {
    this.userConfig = userConfig;
    // Test if CLI is accessible
    try {
      await this.executeCliCommand(['--version']);
    } catch (error) {
      console.error('Failed to initialize Gemini CLI:', error);
      throw new Error('Gemini CLI not found or not executable');
    }
  }

  private async executeCliCommand(args: string[], input?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [this.cliPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`CLI process exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });

      if (input) {
        child.stdin.write(input);
        child.stdin.end();
      }
    });
  }

  async generateContent(params: any): Promise<any> {
    console.log('🔥 GeminiCLIContentGenerator.generateContent called!');
    console.log('🔥 User config:', this.userConfig);
    console.log('🔥 Params:', params);
    
    try {
      // Prepare CLI arguments based on user config and params
      const args = [
        '--prompt', '', // Use --prompt for non-interactive mode
        '--model', this.userConfig.model || 'gemini-2.5-pro'
      ];

      // Add OpenAI config if provider is OpenAI
      if (this.userConfig.provider === 'openai') {
        args.push('--openai-api-key', this.userConfig.apiKey);
        if (this.userConfig.apiUrl) {
          args.push('--openai-api-url', this.userConfig.apiUrl);
        }
      }

      // Get the latest user message
      const lastMessage = params.messages?.[params.messages.length - 1]?.content || '';
      console.log('🔥 CLI args:', args);
      console.log('🔥 Last message:', lastMessage);
      console.log('🔥 CLI path:', this.cliPath);

      // Execute CLI with the user's message
      const response = await this.executeCliCommand(args, lastMessage);
      console.log('🔥 CLI response raw:', JSON.stringify(response));
      console.log('🔥 CLI response length:', response.length);
      console.log('🔥 CLI response type:', typeof response);
      
      // Parse CLI response (assuming JSON format)
      try {
        const parsed = JSON.parse(response);
        console.log('🔥 Parsed JSON response:', parsed);
        return parsed;
      } catch (parseError) {
        console.log('🔥 JSON parse failed, using plain text. Error:', parseError);
        // Fallback to plain text response
        const textResponse = {
          text: response.trim(),
          usage: { inputTokens: 0, outputTokens: 0 }
        };
        console.log('🔥 Final text response:', textResponse);
        return textResponse;
      }
    } catch (error) {
      console.error('🔥 Error executing Gemini CLI:', error);
      throw error;
    }
  }

  async getAvailableTools(): Promise<any[]> {
    try {
      const response = await this.executeCliCommand(['--list-tools']);
      return JSON.parse(response);
    } catch (error) {
      console.error('Error getting tools from CLI:', error);
      return [];
    }
  }
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: any;
  result?: any;
  error?: string;
}

export interface AgentSession {
  id: string;
  messages: ChatMessage[];
  workspaceRoot: string;
  createdAt: Date;
  updatedAt: Date;
}

export class AgentManager {
  private contentGenerator: ContentGenerator | null = null;
  private toolRegistry: ToolRegistry;
  private currentSession: AgentSession | null = null;
  private config: Config;
  private logger: vscode.OutputChannel;

  constructor(
    private context: vscode.ExtensionContext,
    logger: vscode.OutputChannel
  ) {
    this.logger = logger;
    this.toolRegistry = new SimpleToolRegistry();
    this.config = new SimpleConfig();
  }

  async initialize(): Promise<void> {
    try {
      // Initialize configuration from VSCode settings
      await this.loadConfiguration();
      
      // Initialize content generator based on provider
      await this.initializeContentGenerator();

      // Initialize tool registry
      await this.toolRegistry.initialize(this.config);

      this.logger.appendLine('Agent Manager initialized successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.appendLine(`Failed to initialize Agent Manager: ${message}`);
      throw error;
    }
  }

  private async initializeContentGenerator(): Promise<void> {
    const vsConfig = vscode.workspace.getConfiguration('gemini-agent');
    const provider = vsConfig.get<string>('provider', 'gemini');
    
    this.logger.appendLine(`Initializing content generator for provider: ${provider}`);
    
    // 统一使用 Gemini CLI 进行处理，支持 OpenAI 和 Gemini 两种配置
    const geminiGenerator = new GeminiCLIContentGenerator();
    
    if (provider === 'openai') {
      // OpenAI 配置：通过 Gemini CLI 调用 OpenAI API
      const apiKey = vsConfig.get<string>('openai.apiKey', '');
      const apiUrl = vsConfig.get<string>('openai.apiUrl', 'https://api.openai.com/v1');
      const model = vsConfig.get<string>('model', 'gpt-3.5-turbo');
      
      if (!apiKey) {
        throw new Error('OpenAI API key is required when provider is set to "openai". Please set gemini-agent.openai.apiKey in settings.');
      }
      
      this.logger.appendLine(`Configuring Gemini CLI for OpenAI provider with model: ${model}, baseURL: ${apiUrl}`);
      
      await geminiGenerator.initialize({
        provider: 'openai',
        model: model,
        apiKey: apiKey,
        apiUrl: apiUrl
      });
    } else if (provider === 'gemini') {
      // Gemini 配置：通过 Gemini CLI 调用 Gemini API
      const model = vsConfig.get<string>('gemini.model', 'gemini-1.5-pro');
      
      this.logger.appendLine(`Configuring Gemini CLI for Gemini provider with model: ${model}`);
      
      await geminiGenerator.initialize({
        provider: 'gemini',
        model: model
      });
    } else {
      throw new Error(`Unsupported provider: "${provider}". Please configure a supported provider (e.g., 'gemini', 'openai').`);
    }
    
    this.contentGenerator = geminiGenerator;
  }

  // initializeOpenAI method removed - now using unified GeminiCLIContentGenerator for all providers

  async reinitialize(): Promise<void> {
    this.logger.appendLine('Reinitializing AgentManager with new settings...');
    await this.initialize();
  }

  private async loadConfiguration(): Promise<void> {
    const vsConfig = vscode.workspace.getConfiguration('gemini-agent');
    
    // Map VSCode configuration to our Config class
    const authType = vsConfig.get<string>('authType', 'oauth');
    const model = vsConfig.get<string>('model', 'gemini-1.5-pro');
    
    // We'll need to adapt the Config class to work with VSCode settings
    // For now, we'll create a minimal configuration
    this.config.setContentGeneratorConfig({
      authType: authType as any,
      model: model,
      // Add other necessary configuration
    });
  }

  async createNewSession(): Promise<AgentSession> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    
    this.currentSession = {
      id: this.generateSessionId(),
      messages: [],
      workspaceRoot,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return this.currentSession;
  }

  async sendMessage(content: string): Promise<ChatMessage> {
    if (!this.currentSession) {
      throw new Error('No active session. Create a new session first.');
    }

    if (!this.contentGenerator) {
      throw new Error('Agent not initialized. Call initialize() first.');
    }

    // Add user message to session
    const userMessage: ChatMessage = {
      id: this.generateMessageId(),
      role: 'user',
      content,
      timestamp: new Date()
    };

    this.currentSession.messages.push(userMessage);

    try {
      // Get available tools
      const tools = await this.toolRegistry.getTools();
      
      // Send to content generator
      const response = await this.contentGenerator.generateContent({
        messages: this.currentSession.messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        tools: tools.map((tool: any) => tool.getDefinition ? tool.getDefinition() : {}),
        workspaceRoot: this.currentSession.workspaceRoot
      });

      // Process tool calls if any
      const toolCalls: ToolCall[] = [];
      if (response.toolCalls) {
        for (const toolCall of response.toolCalls) {
          try {
            const tool = tools.find((t: any) => t.name === toolCall.name);
            if (tool) {
              const result = await tool.execute(toolCall.parameters, {
                workspaceRoot: this.currentSession.workspaceRoot,
                config: this.config
              });
              
              toolCalls.push({
                id: toolCall.id || this.generateToolCallId(),
                name: toolCall.name,
                parameters: toolCall.parameters,
                result
              });
            }
          } catch (error) {
            toolCalls.push({
              id: toolCall.id || this.generateToolCallId(),
              name: toolCall.name,
              parameters: toolCall.parameters,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }

      // Create assistant message
      const assistantMessage: ChatMessage = {
        id: this.generateMessageId(),
        role: 'assistant',
        content: response.content || response.text || 'No response received',
        timestamp: new Date(),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
      };

      this.currentSession.messages.push(assistantMessage);
      this.currentSession.updatedAt = new Date();

      return assistantMessage;

    } catch (error) {
      const errorMessage: ChatMessage = {
        id: this.generateMessageId(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date()
      };

      this.currentSession.messages.push(errorMessage);
      throw error;
    }
  }

  getCurrentSession(): AgentSession | null {
    return this.currentSession;
  }

  clearCurrentSession(): void {
    this.currentSession = null;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateToolCallId(): string {
    return `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  dispose(): void {
    // Clean up resources
    this.currentSession = null;
    this.contentGenerator = null;
  }
}
