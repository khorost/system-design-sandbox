import type { NodeProps } from '@xyflow/react';
import type { ComponentNode } from '../../../types/index.ts';
import { BaseNode } from './BaseNode.tsx';

export function QueueNode(props: NodeProps<ComponentNode>) {
  return <BaseNode nodeProps={props} borderColor="#7c3aed" bgColor="#1a1030" />;
}
