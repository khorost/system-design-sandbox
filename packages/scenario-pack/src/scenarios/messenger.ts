import type { Scenario } from '../types.js';

export const messengerScenario: Scenario = {
  id: 'lesson-02-messenger',
  lessonNumber: 2,
  module: 1,
  title: 'Messenger (WhatsApp/Telegram)',
  description: 'Design a message delivery system for a messenger app with 1M online users.',
  goal: '1M online users, latency < 200ms, guaranteed delivery',
  difficulty: 'intermediate',
  availableComponents: [
    'web_client',
    'mobile_client',
    'load_balancer',
    'api_gateway',
    'service',
    'kafka',
    'postgresql',
    'redis',
  ],
  hints: [
    'Think about a presence service — how do you know if a user is online?',
    'What if the recipient is offline? Where do you store undelivered messages?',
    'Consider WebSocket for real-time delivery',
    'Redis is great for online status tracking',
  ],
  successCriteria: {
    no_spof: true,
    latency_p99: '<200ms',
    message_loss: '0%',
  },
  startingArchitecture: {
    components: [
      {
        id: 'client-1',
        type: 'web_client',
        position: { x: 50, y: 200 },
        config: { requests_per_sec: 1000 },
      },
      {
        id: 'lb-1',
        type: 'load_balancer',
        position: { x: 250, y: 200 },
        config: { algorithm: 'least_conn', max_connections: 100000 },
      },
    ],
    connections: [
      { id: 'conn-1', from: 'client-1', to: 'lb-1', protocol: 'WebSocket' },
    ],
  },
  tags: ['messenger', 'websocket', 'kafka', 'real-time'],
};
