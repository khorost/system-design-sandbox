import type { NodeProps } from '@xyflow/react';
import type { ComponentNode } from '../../../types/index.ts';
import { BaseNode } from './BaseNode.tsx';

export function DatabaseNode(props: NodeProps<ComponentNode>) {
  return <BaseNode nodeProps={props} borderColor="#854d0e" bgColor="#1c1917" />;
}
