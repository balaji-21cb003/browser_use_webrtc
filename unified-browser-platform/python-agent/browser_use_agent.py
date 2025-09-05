#!/usr/bin/env python3
"""
Full browser-use integration with Azure OpenAI for Unified Browser Platform
Uses the complete browser-use package for high-level browser automation
Integrated with the unified platform's session management and streaming
"""

import asyncio
import sys
import json
import os
import aiohttp
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables from the project root
project_root = Path(__file__).parent.parent
env_path = project_root / '.env'
load_dotenv(env_path)

# Add browser_use_webrtc to Python path for imports
browser_use_path = project_root.parent / "browser_use_webrtc"
if str(browser_use_path) not in sys.path:
    sys.path.insert(0, str(browser_use_path))

# Import browser-use components - using full project capabilities
try:
    from browser_use import Agent
    from browser_use.llm import ChatAzureOpenAI, ChatOpenAI, ChatGoogle
    from browser_use.browser.session import BrowserSession
except ImportError as e:
    print(f"❌ Failed to import browser_use: {e}")
    print(f"🔍 Python path: {sys.path}")
    print(f"🔍 Browser use path: {browser_use_path}")
    print(f"🔍 Browser use path exists: {browser_use_path.exists()}")
    sys.exit(1)


class UnifiedBrowserUseAgent:
    """
    Full browser-use integration for the Unified Browser Platform
    Leverages complete browser-use project capabilities including:
    - Advanced browser session management
    - AI-powered element detection and interaction
    - Session sharing with streaming service
    - Multi-modal capabilities (vision, text, etc.)
    """
    
    def __init__(self, defer_llm: bool = False, disable_highlighting: bool = False):
        self.load_environment()
        self.llm = None
        self.disable_highlighting = disable_highlighting
        if not defer_llm:
            self.setup_llm()
        self.browser_session = None
        self.agent = None
        
    def load_environment(self):
        """Load and validate environment variables"""
        # Azure OpenAI configuration
        self.azure_api_key = os.getenv("AZURE_OPENAI_API_KEY")
        self.azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        self.azure_deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4.1")
        self.api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")
        
        # OpenAI fallback
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        
        # Google AI fallback
        self.google_api_key = os.getenv("GOOGLE_API_KEY")
        
        # LLM provider preference
        self.llm_provider = os.getenv("LLM_PROVIDER", "azure").lower()
        
        # Browser configuration
        self.headless = os.getenv("BROWSER_HEADLESS", "true").lower() == "true"
        self.browser_port = int(os.getenv("BROWSER_PORT", "9222"))
        
    def setup_llm(self):
        """Setup LLM based on provider preference and available credentials"""
        if self.llm is not None:
            return
        if self.llm_provider == "azure" and all([self.azure_api_key, self.azure_endpoint, self.azure_deployment]):
            self.llm = ChatAzureOpenAI(
                model=self.azure_deployment,
                api_key=self.azure_api_key,
                azure_endpoint=self.azure_endpoint,
                azure_deployment=self.azure_deployment,
                api_version=self.api_version,
                temperature=0.7
            )
            print(f"🤖 Using Azure OpenAI - Deployment: {self.azure_deployment}")
            
        elif self.llm_provider == "openai" and self.openai_api_key:
            self.llm = ChatOpenAI(
                model="gpt-4o",
                api_key=self.openai_api_key,
                temperature=0.7
            )
            print("🤖 Using OpenAI GPT-4o")
            
        elif self.llm_provider == "google" and self.google_api_key:
            self.llm = ChatGoogle(
                model="gemini-2.0-flash",
                api_key=self.google_api_key,
                temperature=0.7
            )
            print("🤖 Using Google Gemini 2.0 Flash")
            
        else:
            # Fallback to Azure if configured
            if all([self.azure_api_key, self.azure_endpoint, self.azure_deployment]):
                self.llm = ChatAzureOpenAI(
                    model=self.azure_deployment,
                    api_key=self.azure_api_key,
                    azure_endpoint=self.azure_endpoint,
                    azure_deployment=self.azure_deployment,
                    api_version=self.api_version,
                    temperature=0.7
                )
                print(f"🤖 Fallback to Azure OpenAI - Deployment: {self.azure_deployment}")
            else:
                raise ValueError("No valid LLM configuration found. Please set up Azure OpenAI, OpenAI, or Google AI credentials.")
    
    async def create_agent(self, task: str, browser_context_id: str | None = None, max_steps: int = 10):
        """
        Create browser-use agent with full project capabilities
        Can connect to existing browser session or create new one
        
        Args:
            task: The task for the agent to perform
            browser_context_id: Optional browser CDP WebSocket URL to connect to existing browser
            max_steps: Maximum number of steps for the agent
        """
        try:
            browser_session = None
            
            # Check if we should connect to existing browser (shared with streaming)
            if browser_context_id and browser_context_id.startswith('ws://'):
                # Connect to existing browser via WebSocket CDP endpoint
                print(f"🔗 Connecting to existing browser session: {browser_context_id}")
                
                # Create BrowserSession that connects to existing browser
                browser_session = BrowserSession(
                    cdp_url=browser_context_id,
                    is_local=False  # Connect to existing browser, don't launch new one
                )
                
                print(f"✅ Created browser session for existing browser")
            else:
                print(f"🆕 Creating new browser instance for task")
                # browser_session will be None, so Agent will create its own browser
            
            # Create agent with browser-use capabilities
            self.agent = Agent(
                task=task,
                llm=self.llm,
                max_steps=max_steps,
                browser_session=browser_session,  # Use shared session if available
                use_vision=True,  # Enable vision capabilities
                save_conversation_path=None,  # Can be configured for logging
                calculate_cost=True,  # Enable token cost tracking
            )
            
            # If highlighting is disabled, monkey-patch the highlighting injection function
            if self.disable_highlighting:
                print("🚫 Disabling visual highlighting for cleaner streaming...")
                
                # Monkey-patch the inject_highlighting_script function to do nothing
                async def disabled_inject_highlighting_script(*args, **kwargs):
                    pass  # Do nothing - no highlighting
                
                # Import and patch the highlights module
                try:
                    import browser_use.dom.debug.highlights as highlights_module
                    highlights_module.inject_highlighting_script = disabled_inject_highlighting_script
                    print("✅ Visual highlighting disabled successfully")
                except ImportError:
                    print("⚠️ Could not import highlights module - highlighting may still appear")
            
            # Initialize token cost service to enable cost tracking
            if self.agent.token_cost_service:
                await self.agent.token_cost_service.initialize()
                
                # Configure cost logger to output to stdout
                import logging
                cost_logger = logging.getLogger('cost')
                cost_logger.setLevel(logging.DEBUG)
                cost_logger.propagate = True  # Allow propagation to root logger
                
                # Also configure the root logger to ensure cost logs are captured
                root_logger = logging.getLogger()
                root_logger.setLevel(logging.DEBUG)
                
                # Add a custom handler to ensure cost logs are printed
                class CostHandler(logging.Handler):
                    def emit(self, record):
                        if record.name == 'cost':
                            print(f"🧠 {record.getMessage()}")
                
                cost_logger.addHandler(CostHandler())
                
                # Override the _log_usage method to ensure token usage is captured
                original_log_usage = self.agent.token_cost_service._log_usage
                
                async def enhanced_log_usage(model: str, usage):
                    # Call the original method
                    await original_log_usage(model, usage)
                    
                    # Also print a simplified version for easier parsing
                    total_tokens = usage.usage.prompt_tokens + usage.usage.completion_tokens
                    print(f"💰 TOKEN_USAGE: {model} | {total_tokens} tokens | ${usage.usage.prompt_tokens * 0.0001 + usage.usage.completion_tokens * 0.0003:.4f}")
                
                self.agent.token_cost_service._log_usage = enhanced_log_usage
                
                print(f"💰 Token cost tracking initialized")
            
            print(f"🚀 Created browser-use agent for task: {task}")
            return self.agent
            
        except Exception as e:
            print(f"❌ Error creating agent: {str(e)}")
            # If connection to existing browser fails, create new one
            if browser_context_id:
                print(f"🔄 Falling back to new browser instance")
                return await self.create_agent(task, "", max_steps)
            raise
    
    async def execute_task(self, task: str, browser_context_id: str | None = None, max_steps: int = 10):
        """
        Execute a task using the full browser-use agent
        
        Args:
            task: The task to execute
            browser_context_id: Optional browser context to use
            max_steps: Maximum steps for execution
            
        Returns:
            dict: Execution result with success status and details
        """
        try:
            # Create agent
            agent = await self.create_agent(task, browser_context_id, max_steps)
            
            print(f"🎯 Executing task: {task}")
            print(f"📊 Max steps: {max_steps}")
            print(f"🧠 LLM Provider: {self.llm_provider}")
            
            # Track token usage manually
            initial_usage = None
            if agent.token_cost_service and agent.token_cost_service.usage_history:
                initial_usage = len(agent.token_cost_service.usage_history)
            
            # Execute the task with full browser-use capabilities
            result = await agent.run()
            
            # Calculate token usage
            total_tokens = 0
            total_cost = 0.0
            
            if agent.token_cost_service and agent.token_cost_service.usage_history:
                final_usage = len(agent.token_cost_service.usage_history)
                if initial_usage is not None and final_usage > initial_usage:
                    # Calculate tokens from new usage entries
                    new_entries = agent.token_cost_service.usage_history[initial_usage:]
                    for entry in new_entries:
                        total_tokens += entry.usage.prompt_tokens + entry.usage.completion_tokens
                        # Estimate cost (this is a rough calculation)
                        total_cost += entry.usage.prompt_tokens * 0.0001 + entry.usage.completion_tokens * 0.0003
                    
                    print(f"💰 FINAL_TOKEN_USAGE: {self.llm_provider} | {total_tokens} tokens | ${total_cost:.4f}")
            
            # Extract execution details
            execution_data = {
                "success": True,
                "task": task,
                "llm_provider": self.llm_provider,
                "deployment": self.azure_deployment if self.llm_provider == "azure" else "N/A",
                "steps_executed": len(result.all_results) if hasattr(result, 'all_results') else 0,
                "final_result": str(result),
                "browser_context_id": browser_context_id,
                "token_usage": {
                    "total_tokens": total_tokens,
                    "total_cost": total_cost,
                    "model": self.llm_provider
                }
            }
            
            print(f"✅ Task completed successfully")
            return execution_data
            
        except Exception as e:
            error_data = {
                "success": False,
                "task": task,
                "error": str(e),
                "llm_provider": self.llm_provider,
                "browser_context_id": browser_context_id
            }
            print(f"❌ Task failed: {str(e)}")
            return error_data
    
    async def cleanup(self):
        """Cleanup browser resources"""
        try:
            if self.agent and hasattr(self.agent, 'browser') and self.agent.browser:
                await self.agent.browser.close()
                print("🧹 Browser resources cleaned up")
        except Exception as e:
            print(f"⚠️ Error during cleanup: {str(e)}")
    
    async def create_session_via_api(self):
        """Create a new session via the Unified Browser Platform API"""
        try:
            api_url = "http://localhost:3000/api/sessions/create"
            api_url = "http://localhost:3000/api/sessions/create"
            payload = {}
            
            print(f"🔗 [API CALL] Creating session via API: {api_url}")
            print(f"📤 [API CALL] Request payload: {json.dumps(payload, indent=2)}")
            print(f"🔗 [API CALL] Creating session via API: {api_url}")
            print(f"📤 [API CALL] Request payload: {json.dumps(payload, indent=2)}")
            
            async with aiohttp.ClientSession() as session:
                async with session.post(api_url, json=payload) as response:
                    print(f"📥 [API CALL] Response status: {response.status}")
                    print(f"📥 [API CALL] Response headers: {dict(response.headers)}")
                    
                    print(f"📥 [API CALL] Response status: {response.status}")
                    print(f"📥 [API CALL] Response headers: {dict(response.headers)}")
                    
                    if response.status == 200:
                        result = await response.json()
                        session_id = result.get('sessionId')
                        print(f"✅ [API CALL] Session created successfully: {session_id}")
                        print(f"📥 [API CALL] Full response: {json.dumps(result, indent=2)}")
                        print(f"✅ [API CALL] Session created successfully: {session_id}")
                        print(f"📥 [API CALL] Full response: {json.dumps(result, indent=2)}")
                        return session_id
                    else:
                        error_text = await response.text()
                        print(f"❌ [API CALL] Failed to create session. Status: {response.status}, Error: {error_text}")
                        print(f"❌ [API CALL] Failed to create session. Status: {response.status}, Error: {error_text}")
                        return None
                        
        except Exception as e:
            print(f"❌ [API CALL] Error creating session via API: {str(e)}")
            print(f"❌ [API CALL] Error creating session via API: {str(e)}")
            return None
    
    async def execute_task_via_api(self, session_id: str, task: str, max_steps: int = 20):
        """Execute a task via the Unified Browser Platform API"""
        try:
            api_url = "http://localhost:3000/api/browser-use/execute"
            api_url = "http://localhost:3000/api/browser-use/execute"
            payload = {
                "sessionId": session_id,
                "task": task,
                "options": {
                    "llmModel": "gpt-4.1",
                    "maxSteps": max_steps
                }
            }
            
            print(f"🎯 [API CALL] Executing task via API: {api_url}")
            print(f"📋 [API CALL] Task: {task}")
            print(f"📊 [API CALL] Max steps: {max_steps}")
            print(f"📤 [API CALL] Request payload: {json.dumps(payload, indent=2)}")
            print(f"🎯 [API CALL] Executing task via API: {api_url}")
            print(f"📋 [API CALL] Task: {task}")
            print(f"📊 [API CALL] Max steps: {max_steps}")
            print(f"📤 [API CALL] Request payload: {json.dumps(payload, indent=2)}")
            
            async with aiohttp.ClientSession() as session:
                async with session.post(api_url, json=payload) as response:
                    print(f"📥 [API CALL] Response status: {response.status}")
                    print(f"📥 [API CALL] Response headers: {dict(response.headers)}")
                    
                    print(f"📥 [API CALL] Response status: {response.status}")
                    print(f"📥 [API CALL] Response headers: {dict(response.headers)}")
                    
                    if response.status == 200:
                        result = await response.json()
                        task_id = result.get('taskId')
                        live_url = result.get('liveUrl')
                        print(f"✅ [API CALL] Task execution started successfully!")
                        print(f"📋 [API CALL] Task ID: {task_id}")
                        print(f"🔗 [API CALL] Live URL: {live_url}")
                        print(f"📺 [API CALL] Streaming URL: http://localhost:3000/stream/{session_id}?sessionId={session_id}")
                        print(f"📥 [API CALL] Full response: {json.dumps(result, indent=2)}")
                        print(f"✅ [API CALL] Task execution started successfully!")
                        print(f"📋 [API CALL] Task ID: {task_id}")
                        print(f"🔗 [API CALL] Live URL: {live_url}")
                        print(f"📺 [API CALL] Streaming URL: http://localhost:3000/stream/{session_id}?sessionId={session_id}")
                        print(f"📥 [API CALL] Full response: {json.dumps(result, indent=2)}")
                        return result
                    else:
                        error_text = await response.text()
                        print(f"❌ [API CALL] Failed to execute task. Status: {response.status}, Error: {error_text}")
                        print(f"❌ [API CALL] Failed to execute task. Status: {response.status}, Error: {error_text}")
                        return None
                        
        except Exception as e:
            print(f"❌ [API CALL] Error executing task via API: {str(e)}")
            return None
    
    async def monitor_task_progress(self, session_id: str, task_id: str):
        """Monitor task progress via the Unified Browser Platform API"""
        try:
            api_url = f"http://localhost:3000/api/browser-use/status/{task_id}"
            
            print(f"📊 [API CALL] Monitoring task progress: {api_url}")
            
            async with aiohttp.ClientSession() as session:
                async with session.get(api_url) as response:
                    print(f"📥 [API CALL] Progress response status: {response.status}")
                    
                    if response.status == 200:
                        result = await response.json()
                        print(f"📊 [API CALL] Task progress: {json.dumps(result, indent=2)}")
                        return result
                    else:
                        error_text = await response.text()
                        print(f"❌ [API CALL] Failed to get task progress. Status: {response.status}, Error: {error_text}")
                        return None
                        
        except Exception as e:
            print(f"❌ [API CALL] Error monitoring task progress: {str(e)}")
            return None


async def main():
    """
    Main entry point for the browser-use agent
    Supports both direct execution and integration with unified platform
    """
    # TESTING: Print startup information
    print("🚀 [TESTING] Python browser_use_agent.py started")
    print(f"🔍 [TESTING] Command line arguments: {sys.argv}")
    print(f"🔍 [TESTING] Environment variables:")
    for key in ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_DEPLOYMENT_NAME', 'LLM_PROVIDER', 'PYTHONPATH']:
        value = os.getenv(key, 'NOT_SET')
        if key == 'AZURE_OPENAI_API_KEY' and value != 'NOT_SET':
            value = f"{value[:10]}...{value[-4:]}" if len(value) > 14 else "***"
        print(f"  {key}: {value}")
    
    if len(sys.argv) < 2:
        print("Usage: python browser_use_agent.py '<task>' [max_steps] [browser_context_id]")
        print("Examples:")
        print("  python browser_use_agent.py 'go to youtube and search mr.beast'")
        print("  python browser_use_agent.py 'fill google form with test data' 15")
        print("  python browser_use_agent.py 'book redbus ticket' 20 context_123")
        print("")
        print("🚀 NEW: Auto-session creation and API execution:")
        print("  python browser_use_agent.py 'go to youtube' --api")
        print("  python browser_use_agent.py 'search google' 10 --api")
        return
    
    # Parse arguments and handle --api flag
    raw_args = sys.argv[1:]
    
    # Sanitize arguments to avoid issues with pasted non-breaking spaces (\xa0)
    def _sanitize_token(token: str) -> str:
        try:
            return token.replace('\xa0', ' ').strip()
        except Exception:
            return token
    
    sanitized_args = [_sanitize_token(a) for a in raw_args]
    
    # Detect and strip --api and --disable-highlighting flags even if they're embedded inside the quoted task or tokens
    use_api = False
    disable_highlighting = False
    cleaned_args = []
    for token in sanitized_args:
        if "--api" in token:
            use_api = True
            token = token.replace("--api", "").strip()
            if not token:
                continue
        if "--disable-highlighting" in token:
            disable_highlighting = True
            token = token.replace("--disable-highlighting", "").strip()
            if not token:
                continue
        cleaned_args.append(token)
    args = cleaned_args
    
    # Parse remaining arguments
    if len(args) < 1:
        print("❌ No task provided")
        return
    
    # If the user accidentally pasted the entire command as one token, try a fallback split
    if len(args) == 1 and '  ' in args[0]:
        parts = [p for p in args[0].split(' ') if p]
        args = parts
    
    task = args[0]
    max_steps = int(args[1]) if len(args) > 1 else 10
    session_id = args[2] if len(args) > 2 else None  # Session ID from Node.js service
    browser_context_id = args[3] if len(args) > 3 else None  # CDP endpoint
    
    # TESTING: Print parsed arguments
    print(f"📋 [TESTING] Parsed arguments:")
    print(f"  Task: {task}")
    print(f"  Max steps: {max_steps}")
    print(f"  Session ID: {session_id}")
    print(f"  Browser context ID: {browser_context_id}")
    print(f"  Use API: {use_api}")
    print(f"  Disable highlighting: {disable_highlighting}")
    
    # If --api flag is present, use API execution instead of local agent
    if use_api:
        print("🚀 [API MODE] Using Unified Browser Platform API for execution")
        print("🔗 Creating session and executing task via API...")
        
        # Defer LLM setup in API mode; the Node service owns execution
        agent = UnifiedBrowserUseAgent(defer_llm=True, disable_highlighting=disable_highlighting)
        
        try:
            # Create session via API
            session_id = await agent.create_session_via_api()
            if not session_id:
                print("❌ Failed to create session. Exiting.")
                return
            
            # Execute task via API
            result = await agent.execute_task_via_api(session_id, task, max_steps)
            if not result:
                print("❌ Failed to execute task. Exiting.")
                return
            
            # Extract task ID for monitoring
            task_id = result.get('taskId')
            if task_id:
                print(f"📊 [API MODE] Task started with ID: {task_id}")
                print(f"📊 [API MODE] Monitoring task progress...")
                
                # Monitor task progress
                progress_result = await agent.monitor_task_progress(session_id, task_id)
                if progress_result:
                    print(f"📊 [API MODE] Task progress retrieved successfully")
                else:
                    print(f"⚠️ [API MODE] Could not retrieve task progress")
            
            # Extract task ID for monitoring
            task_id = result.get('taskId')
            if task_id:
                print(f"📊 [API MODE] Task started with ID: {task_id}")
                print(f"📊 [API MODE] Monitoring task progress...")
                
                # Monitor task progress
                progress_result = await agent.monitor_task_progress(session_id, task_id)
                if progress_result:
                    print(f"📊 [API MODE] Task progress retrieved successfully")
                else:
                    print(f"⚠️ [API MODE] Could not retrieve task progress")
            
            print("✅ [API MODE] Task execution completed successfully via API!")
            print("📤 [API MODE] Final result:")
            print(json.dumps(result, indent=2))
            return
            
        except Exception as e:
            print(f"❌ [API MODE] Error during API execution: {str(e)}")
            import traceback
            print(f"❌ [API MODE] Traceback: {traceback.format_exc()}")
            return
    
    # Generate streaming URLs for monitoring
    if session_id:
        # Use the session ID provided by Node.js service
        streaming_url = f"http://localhost:3000/stream/{session_id}?sessionId={session_id}"
        print(f"📺 [TESTING] Streaming URL: {streaming_url}")
        print(f"🔗 [TESTING] Live URL: http://localhost:3000/api/live/{session_id}")
    elif browser_context_id and browser_context_id.startswith('ws://'):
        # Fallback: Extract session ID from CDP endpoint (for backward compatibility)
        fallback_session_id = "session_" + str(hash(browser_context_id))[-8:] if browser_context_id else "unknown"
        streaming_url = f"http://localhost:3000/stream/{fallback_session_id}?sessionId={fallback_session_id}"
        print(f"📺 [TESTING] Fallback streaming URL: {streaming_url}")
        print(f"🔗 [TESTING] Fallback live URL: http://localhost:3000/api/live/{fallback_session_id}")
    else:
        print("📺 [TESTING] No streaming session - using local browser")
        print("📺 [TESTING] To test with streaming, provide session ID or CDP URL")
        print("📺 [TESTING] Example: ws://127.0.0.1:9222/devtools/browser/...")
    
    # Create and execute with full browser-use agent
    print("🤖 [TESTING] Creating UnifiedBrowserUseAgent...")
    agent = UnifiedBrowserUseAgent(disable_highlighting=disable_highlighting)
    
    try:
        print("🎯 [TESTING] Starting task execution...")
        result = await agent.execute_task(task, browser_context_id, max_steps)
        
        # TESTING: Print result before JSON output
        print("✅ [TESTING] Task execution completed successfully!")
        print(f"📊 [TESTING] Result type: {type(result)}")
        print(f"📊 [TESTING] Result keys: {list(result.keys()) if isinstance(result, dict) else 'Not a dict'}")
        
        # Output result as JSON for integration with Node.js service
        print("📤 [TESTING] Outputting JSON result:")
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        print(f"❌ [TESTING] Task execution failed: {str(e)}")
        print(f"❌ [TESTING] Exception type: {type(e).__name__}")
        import traceback
        print(f"❌ [TESTING] Traceback: {traceback.format_exc()}")
        
        error_result = {
            "success": False,
            "error": str(e),
            "task": task
        }
        print("📤 [TESTING] Outputting error JSON:")
        print(json.dumps(error_result, indent=2))
        sys.exit(1)
        
    finally:
        print("🧹 [TESTING] Cleaning up agent...")
        await agent.cleanup()
        print("✅ [TESTING] Python browser_use_agent.py finished")


if __name__ == "__main__":
    asyncio.run(main())
