import type { NodeProps } from '@xyflow/react';
import type { ComponentNode } from '../../../types/index.ts';
import { BaseNode } from './BaseNode.tsx';

export function ServiceNode(props: NodeProps<ComponentNode>) {
  return <BaseNode nodeProps={props} borderColor="#475569" bgColor="#1e293b" />;
}
