import type { NodeProps } from '@xyflow/react';
import type { ComponentNode } from '../../../types/index.ts';
import { BaseNode } from './BaseNode.tsx';

export function CacheNode(props: NodeProps<ComponentNode>) {
  return <BaseNode nodeProps={props} borderColor="#dc2626" bgColor="#1a1020" />;
}
