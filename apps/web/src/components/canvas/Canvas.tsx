import { useCallback, useRef, type DragEvent } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  reconnectEdge,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useCanvasStore } from '../../store/canvasStore.ts';
import type { ComponentNode, ComponentEdge, ComponentNodeData, ComponentCategory, ComponentType } from '../../types/index.ts';
import { NODE_TYPE_MAP } from '../../types/index.ts';
import { getDefinition } from '@system-design-sandbox/component-library';
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

const CLIENT_TYPES = new Set(['web_client', 'mobile_client', 'external_api']);

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
  const selectEdge = useCanvasStore((s) => s.selectEdge);

  const edgeReconnectSuccessful = useRef(true);

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback(
    (oldEdge: ComponentEdge, newConnection: Connection) => {
      edgeReconnectSuccessful.current = true;
      const { edges: currentEdges } = useCanvasStore.getState();
      useCanvasStore.setState({ edges: reconnectEdge(oldEdge, newConnection, currentEdges) as ComponentEdge[] });
    },
    [],
  );

  const onReconnectEnd = useCallback(
    (_: MouseEvent | TouchEvent, edge: ComponentEdge) => {
      if (!edgeReconnectSuccessful.current) {
        const { edges: currentEdges } = useCanvasStore.getState();
        useCanvasStore.setState({ edges: currentEdges.filter((e) => e.id !== edge.id) });
      }
      edgeReconnectSuccessful.current = true;
    },
    [],
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: ComponentEdge) => {
      selectEdge(edge.id);
    },
    [selectEdge],
  );

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

      // Initialize config with definition defaults
      const def = getDefinition(componentType);
      const defaultConfig: Record<string, unknown> = {};
      if (def) {
        for (const p of def.params) {
          defaultConfig[p.key] = p.default;
        }
      }

      const newNode: ComponentNode = {
        id: getNextId(),
        type: nodeType,
        position,
        data: {
          label,
          componentType,
          category,
          icon,
          config: defaultConfig,
        } satisfies ComponentNodeData,
      };

      addNode(newNode);
    },
    [screenToFlowPosition, addNode]
  );

  const isValidConnection = useCallback(
    (connection: Connection | ComponentEdge) => {
      const target = 'target' in connection ? connection.target : null;
      const targetNode = target ? nodes.find((n) => n.id === target) : null;
      if (targetNode && CLIENT_TYPES.has(targetNode.data.componentType)) {
        return false;
      }
      return true;
    },
    [nodes],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    selectEdge(null);
  }, [selectNode, selectEdge]);

  return (
    <div ref={reactFlowWrapper} className="w-full h-full relative">
      <Toolbar />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onPaneClick={onPaneClick}
        onEdgeClick={onEdgeClick}
        onReconnectStart={onReconnectStart}
        onReconnect={onReconnect}
        onReconnectEnd={onReconnectEnd}
        edgesReconnectable
        deleteKeyCode="Delete"
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
