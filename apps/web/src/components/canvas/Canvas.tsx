import { useCallback, useRef, type DragEvent } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useCanvasStore } from '../../store/canvasStore.ts';
import type { ComponentNode, ComponentNodeData, ComponentCategory, ComponentType } from '../../types/index.ts';
import { NODE_TYPE_MAP } from '../../types/index.ts';
import { ServiceNode } from './nodes/ServiceNode.tsx';
import { DatabaseNode } from './nodes/DatabaseNode.tsx';
import { CacheNode } from './nodes/CacheNode.tsx';
import { QueueNode } from './nodes/QueueNode.tsx';
import { LoadBalancerNode } from './nodes/LoadBalancerNode.tsx';
import { GatewayNode } from './nodes/GatewayNode.tsx';
import { FlowEdge } from './edges/FlowEdge.tsx';
import { Toolbar } from './controls/Toolbar.tsx';

const nodeTypes: NodeTypes = {
  serviceNode: ServiceNode,
  databaseNode: DatabaseNode,
  cacheNode: CacheNode,
  queueNode: QueueNode,
  loadBalancerNode: LoadBalancerNode,
  gatewayNode: GatewayNode,
};

const edgeTypes: EdgeTypes = {
  flow: FlowEdge,
};

let nodeId = 0;
function getNextId() {
  return `node-${++nodeId}-${Date.now()}`;
}

function CanvasInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const addNode = useCanvasStore((s) => s.addNode);
  const selectNode = useCanvasStore((s) => s.selectNode);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      const componentType = event.dataTransfer.getData('application/reactflow-type') as ComponentType;
      if (!componentType) return;

      const label = event.dataTransfer.getData('application/reactflow-label');
      const icon = event.dataTransfer.getData('application/reactflow-icon');
      const category = event.dataTransfer.getData('application/reactflow-category') as ComponentCategory;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const nodeType = NODE_TYPE_MAP[componentType] || 'serviceNode';

      const newNode: ComponentNode = {
        id: getNextId(),
        type: nodeType,
        position,
        data: {
          label,
          componentType,
          category,
          icon,
          config: {},
        } satisfies ComponentNodeData,
      };

      addNode(newNode);
    },
    [screenToFlowPosition, addNode]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full relative">
      <Toolbar />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          type: 'flow',
          style: { stroke: '#3b82f6', strokeWidth: 2 },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
        <Controls className="!bg-[var(--color-surface)] !border-[var(--color-border)] !rounded-lg [&>button]:!bg-[var(--color-surface)] [&>button]:!border-[var(--color-border)] [&>button]:!text-slate-300 [&>button:hover]:!bg-[var(--color-surface-hover)]" />
        <MiniMap
          className="!bg-[var(--color-surface)] !border-[var(--color-border)] !rounded-lg"
          nodeColor="#3b82f6"
          maskColor="rgba(15,23,42,0.8)"
        />
      </ReactFlow>
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
