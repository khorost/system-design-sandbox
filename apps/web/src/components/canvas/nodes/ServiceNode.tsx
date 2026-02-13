import type { NodeProps } from '@xyflow/react';
import type { ComponentNode } from '../../../types/index.ts';
import { BaseNode } from './BaseNode.tsx';

const CLIENT_TYPES = new Set(['web_client', 'mobile_client', 'external_api']);

export function ServiceNode(props: NodeProps<ComponentNode>) {
  const isClient = CLIENT_TYPES.has(props.data.componentType);
  return <BaseNode nodeProps={props} borderColor="#475569" bgColor="#1e293b" hideTargetHandle={isClient} />;
}
