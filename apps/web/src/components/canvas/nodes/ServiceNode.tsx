import type { NodeProps } from '@xyflow/react';

import { CLIENT_TYPES } from '../../../constants/componentTypes.ts';
import type { ComponentNode } from '../../../types/index.ts';
import { BaseNode } from './BaseNode.tsx';
import { ServiceContainerNode } from './ServiceContainerNode.tsx';

export function ServiceNode(props: NodeProps<ComponentNode>) {
  // service_container type always renders as Service Container
  // service type renders as Service Container only when it has pipelines config (legacy conversion)
  if (props.data.componentType === 'service_container' || Array.isArray(props.data.config.pipelines)) {
    return <ServiceContainerNode {...props} />;
  }
  const isClient = CLIENT_TYPES.has(props.data.componentType);
  return <BaseNode nodeProps={props} borderColor="#475569" bgColor="#1e293b" hideTargetHandle={isClient} />;
}
