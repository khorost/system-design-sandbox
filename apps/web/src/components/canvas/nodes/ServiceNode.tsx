import type { NodeProps } from '@xyflow/react';
import type { ComponentNode } from '../../../types/index.ts';
import { BaseNode } from './BaseNode.tsx';
import { CLIENT_TYPES } from '../../../constants/componentTypes.ts';

export function ServiceNode(props: NodeProps<ComponentNode>) {
  const isClient = CLIENT_TYPES.has(props.data.componentType);
  return <BaseNode nodeProps={props} borderColor="#475569" bgColor="#1e293b" hideTargetHandle={isClient} />;
}
