import { BrowserStreamingService } from './src/services/browser-streaming.js';

async function testStreamingDebug() {
  console.log('🧪 Testing Streaming Debug...');
  
  const browserService = new BrowserStreamingService();
  await browserService.initialize();
  
  const sessionId = 'test-streaming-debug-' + Date.now();
  console.log('📝 Created test session:', sessionId);
  
  try {
    // Create browser session
    const session = await browserService.createSessionWithSeparateBrowser(sessionId, {
      width: 1920,
      height: 1080
    });
    
    console.log('✅ Browser session created successfully');
    console.log('🔌 CDP Endpoint:', session.browserWSEndpoint);
    console.log('📐 Viewport:', session.viewport);
    
    // Navigate to a test page
    await browserService.navigate(sessionId, 'https://www.google.com');
    console.log('🌐 Navigated to Google for testing');
    
    // Wait a bit for the page to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test streaming
    console.log('🎬 Testing streaming...');
    
    let frameCount = 0;
    const testIO = {
      to: (sid) => ({
        emit: (event, data) => {
          if (event === 'video-frame') {
            frameCount++;
            console.log(`📹 Frame ${frameCount} received: ${data.length} base64 chars`);
          }
        }
      })
    };
    
    await browserService.startVideoStreaming(sessionId, testIO);
    console.log('✅ Video streaming started');
    
    // Wait for frames
    console.log('⏳ Waiting for frames...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log(`📊 Total frames received: ${frameCount}`);
    
    if (frameCount > 0) {
      console.log('✅ Streaming is working!');
    } else {
      console.log('❌ No frames received - streaming not working');
    }
    
    // Cleanup
    await browserService.stopVideoStreaming(sessionId);
    await browserService.destroySession(sessionId);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testStreamingDebug().catch(console.error);
