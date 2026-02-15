import type { NodeProps } from '@xyflow/react';

import type { ComponentNode } from '../../../types/index.ts';
import { BaseNode } from './BaseNode.tsx';

export function GatewayNode(props: NodeProps<ComponentNode>) {
  return <BaseNode nodeProps={props} borderColor="#059669" bgColor="#0a1a15" />;
}
