import type { NodeProps } from '@xyflow/react';
import type { ComponentNode } from '../../../types/index.ts';
import { BaseNode } from './BaseNode.tsx';

export function LoadBalancerNode(props: NodeProps<ComponentNode>) {
  return <BaseNode nodeProps={props} borderColor="#0891b2" bgColor="#0c1a2a" />;
}
