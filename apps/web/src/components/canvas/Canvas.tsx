import { useCallback, useEffect, useRef, type DragEvent } from 'react';
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
import { CONTAINER_TYPES, CONTAINER_Z_INDEX, isValidNesting, getAbsolutePosition, getNestingDepth } from '../../utils/networkLatency.ts';
import { ServiceNode } from './nodes/ServiceNode.tsx';
import { DatabaseNode } from './nodes/DatabaseNode.tsx';
import { CacheNode } from './nodes/CacheNode.tsx';
import { QueueNode } from './nodes/QueueNode.tsx';
import { LoadBalancerNode } from './nodes/LoadBalancerNode.tsx';
import { GatewayNode } from './nodes/GatewayNode.tsx';
import { ContainerNode } from './nodes/ContainerNode.tsx';
import { FlowEdge } from './edges/FlowEdge.tsx';
import { Toolbar } from './controls/Toolbar.tsx';
import { DebugStats } from './DebugStats.tsx';

const nodeTypes: NodeTypes = {
  serviceNode: ServiceNode,
  databaseNode: DatabaseNode,
  cacheNode: CacheNode,
  queueNode: QueueNode,
  loadBalancerNode: LoadBalancerNode,
  gatewayNode: GatewayNode,
  containerNode: ContainerNode,
};

const edgeTypes: EdgeTypes = {
  flow: FlowEdge,
};

const CLIENT_TYPES = new Set(['web_client', 'mobile_client', 'external_api']);

const NODE_TYPE_COLORS: Record<string, string> = {
  serviceNode: '#475569',
  databaseNode: '#854d0e',
  cacheNode: '#dc2626',
  queueNode: '#7c3aed',
  gatewayNode: '#059669',
  loadBalancerNode: '#0891b2',
};

const CONTAINER_COLORS: Record<string, string> = {
  docker_container: '#3b82f6',
  kubernetes_pod: '#8b5cf6',
  vm_instance: '#64748b',
  rack: '#22c55e',
  datacenter: '#f97316',
};

function getMiniMapNodeColor(node: ComponentNode): string {
  const custom = node.data.config.color as string | undefined;
  if (custom) return custom;
  return CONTAINER_COLORS[node.data.componentType]
    ?? NODE_TYPE_COLORS[NODE_TYPE_MAP[node.data.componentType] ?? '']
    ?? '#475569';
}

let nodeId = 0;
function getNextId() {
  return `node-${++nodeId}-${Date.now()}`;
}

/** Pick the most deeply nested container (innermost wins). */
function pickInnermostContainer(containers: ComponentNode[]): ComponentNode {
  const storeNodes = useCanvasStore.getState().nodes;
  const nodeMap = new Map(storeNodes.map(n => [n.id, n]));
  return containers.reduce((best, curr) => {
    const bestNode = nodeMap.get(best.id) ?? best;
    const currNode = nodeMap.get(curr.id) ?? curr;
    const bestDepth = getNestingDepth(bestNode, nodeMap);
    const currDepth = getNestingDepth(currNode, nodeMap);
    if (currDepth !== bestDepth) return currDepth > bestDepth ? curr : best;
    // Tiebreaker: smaller area
    const ba = ((best.style?.width as number) ?? 400) * ((best.style?.height as number) ?? 300);
    const ca = ((curr.style?.width as number) ?? 400) * ((curr.style?.height as number) ?? 300);
    return ca < ba ? curr : best;
  });
}

function CanvasInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getIntersectingNodes, setCenter, getZoom } = useReactFlow();

  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const addNode = useCanvasStore((s) => s.addNode);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const selectEdge = useCanvasStore((s) => s.selectEdge);
  const focusNodeId = useCanvasStore((s) => s.focusNodeId);
  const clearFocus = useCanvasStore((s) => s.clearFocus);

  useEffect(() => {
    if (!focusNodeId) return;
    const node = nodes.find((n) => n.id === focusNodeId);
    clearFocus();
    if (!node) return;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const abs = getAbsolutePosition(node, nodeMap);
    const w = (node.style?.width as number) ?? node.width ?? 200;
    const h = (node.style?.height as number) ?? node.height ?? 60;
    setCenter(abs.x + w / 2, abs.y + h / 2, { zoom: getZoom(), duration: 300 });
  }, [focusNodeId, nodes, clearFocus, setCenter, getZoom]);

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

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, draggedNode: ComponentNode) => {
      const { setNodeParent, pushSnapshot } = useCanvasStore.getState();
      pushSnapshot();
      const intersecting = getIntersectingNodes(draggedNode);

      const validContainers = intersecting.filter((n) => {
        const nd = n as ComponentNode;
        return nd.id !== draggedNode.id &&
          CONTAINER_TYPES.has(nd.data.componentType) &&
          isValidNesting(draggedNode.data.componentType, nd.data.componentType);
      }) as ComponentNode[];

      if (validContainers.length === 0) {
        // Detach if currently parented and outside all valid containers
        if (draggedNode.parentId) {
          setNodeParent(draggedNode.id, null);
        }
        return;
      }

      // Pick innermost container (deepest nesting)
      const target = pickInnermostContainer(validContainers);

      if (target.id !== draggedNode.parentId) {
        setNodeParent(draggedNode.id, target.id);
      }
    },
    [getIntersectingNodes],
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
      const isContainer = CONTAINER_TYPES.has(componentType);

      // Initialize config with definition defaults
      const def = getDefinition(componentType);
      const defaultConfig: Record<string, unknown> = {};
      if (def) {
        for (const p of def.params) {
          defaultConfig[p.key] = p.default;
        }
      }

      // Auto-parent: find container under the drop point
      const currentNodes = useCanvasStore.getState().nodes;
      const nodeMap = new Map(currentNodes.map(n => [n.id, n]));

      const hitContainers = currentNodes.filter(n => {
        if (!CONTAINER_TYPES.has(n.data.componentType)) return false;
        if (!isValidNesting(componentType, n.data.componentType)) return false;
        const abs = getAbsolutePosition(n, nodeMap);
        const w = (n.style?.width as number) ?? n.width ?? 400;
        const h = (n.style?.height as number) ?? n.height ?? 300;
        return position.x >= abs.x && position.x <= abs.x + w &&
               position.y >= abs.y && position.y <= abs.y + h;
      });

      let parentId: string | undefined;
      let adjustedPosition = position;

      if (hitContainers.length > 0) {
        const target = pickInnermostContainer(hitContainers);
        parentId = target.id;
        const parentAbs = getAbsolutePosition(target, nodeMap);
        adjustedPosition = {
          x: Math.max(10, position.x - parentAbs.x),
          y: Math.max(35, position.y - parentAbs.y),
        };
      }

      const newNode: ComponentNode = {
        id: getNextId(),
        type: nodeType,
        position: adjustedPosition,
        data: {
          label,
          componentType,
          category,
          icon,
          config: defaultConfig,
        } satisfies ComponentNodeData,
        ...(isContainer ? { style: { width: 400, height: 300 }, dragHandle: '.container-drag-handle', zIndex: CONTAINER_Z_INDEX[componentType] ?? -1 } : {}),
        ...(parentId ? { parentId, extent: 'parent' as const } : {}),
      };

      addNode(newNode);
    },
    [screenToFlowPosition, addNode]
  );

  const isValidConnection = useCallback(
    (connection: Connection | ComponentEdge) => {
      const source = 'source' in connection ? connection.source : null;
      const target = 'target' in connection ? connection.target : null;
      const sourceNode = source ? nodes.find((n) => n.id === source) : null;
      const targetNode = target ? nodes.find((n) => n.id === target) : null;
      // Block connections to/from container nodes
      if (sourceNode && CONTAINER_TYPES.has(sourceNode.data.componentType)) return false;
      if (targetNode && CONTAINER_TYPES.has(targetNode.data.componentType)) return false;
      // Block connections targeting client nodes
      if (targetNode && CLIENT_TYPES.has(targetNode.data.componentType)) return false;
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
        onNodeDragStop={onNodeDragStop}
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
          nodeColor={(node) => getMiniMapNodeColor(node as ComponentNode)}
          maskColor="rgba(15,23,42,0.8)"
        />
      </ReactFlow>
      <DebugStats />
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
