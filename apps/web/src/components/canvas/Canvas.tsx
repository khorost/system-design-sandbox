import '@xyflow/react/dist/style.css';

import { getDefinition } from '@system-design-sandbox/component-library';
import {
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type EdgeTypes,
  MiniMap,
  type NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  reconnectEdge,
  useReactFlow,
} from '@xyflow/react';
import { type DragEvent,useCallback, useEffect, useRef } from 'react';

import { CONFIG } from '../../config/constants.ts';
import { CONTAINER_COLORS,NODE_TYPE_COLORS } from '../../constants/colors.ts';
import { CLIENT_TYPES } from '../../constants/componentTypes.ts';
import { useCanvasStore } from '../../store/canvasStore.ts';
import type { ComponentCategory, ComponentEdge, ComponentNode, ComponentNodeData, ComponentType } from '../../types/index.ts';
import { NODE_TYPE_MAP } from '../../types/index.ts';
import { CONTAINER_TYPES, CONTAINER_Z_INDEX, getAbsolutePosition, getNestingDepth,isValidNesting } from '../../utils/networkLatency.ts';
import { sanitizeLabel } from '../../utils/sanitize.ts';
import { Toolbar } from './controls/Toolbar.tsx';
import { DebugStats } from './DebugStats.tsx';
import { FlowEdge } from './edges/FlowEdge.tsx';
import { CacheNode } from './nodes/CacheNode.tsx';
import { ContainerNode } from './nodes/ContainerNode.tsx';
import { DatabaseNode } from './nodes/DatabaseNode.tsx';
import { GatewayNode } from './nodes/GatewayNode.tsx';
import { LoadBalancerNode } from './nodes/LoadBalancerNode.tsx';
import { QueueNode } from './nodes/QueueNode.tsx';
import { ServiceNode } from './nodes/ServiceNode.tsx';

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
    const ba = ((best.style?.width as number) ?? CONFIG.CANVAS.CONTAINER_DEFAULT_WIDTH) * ((best.style?.height as number) ?? CONFIG.CANVAS.CONTAINER_DEFAULT_HEIGHT);
    const ca = ((curr.style?.width as number) ?? CONFIG.CANVAS.CONTAINER_DEFAULT_WIDTH) * ((curr.style?.height as number) ?? CONFIG.CANVAS.CONTAINER_DEFAULT_HEIGHT);
    return ca < ba ? curr : best;
  });
}

function getNodeBounds(node: ComponentNode, nodeMap: Map<string, ComponentNode>) {
  const abs = getAbsolutePosition(node, nodeMap);
  const width = (node.style?.width as number) ?? node.measured?.width ?? node.width ?? (CONTAINER_TYPES.has(node.data.componentType) ? CONFIG.CANVAS.CONTAINER_DEFAULT_WIDTH : 280);
  const height = (node.style?.height as number) ?? node.measured?.height ?? node.height ?? (CONTAINER_TYPES.has(node.data.componentType) ? CONFIG.CANVAS.CONTAINER_DEFAULT_HEIGHT : 90);
  return { x: abs.x, y: abs.y, width, height };
}

function isPointInsideContainerArea(
  container: ComponentNode,
  point: { x: number; y: number },
  nodeMap: Map<string, ComponentNode>,
  contentOnly: boolean,
) {
  const { x, y, width, height } = getNodeBounds(container, nodeMap);
  const left = x + (contentOnly ? CONFIG.CANVAS.CONTAINER_PADDING_LEFT : 0);
  const top = y + (contentOnly ? CONFIG.CANVAS.CONTAINER_PADDING_TOP : 0);
  const right = x + width - (contentOnly ? 12 : 0);
  const bottom = y + height - 12;

  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

function getValidContainersAtPoint(
  componentType: ComponentNode['data']['componentType'],
  nodeId: string,
  point: { x: number; y: number },
  currentNodes: ComponentNode[],
  nodeMap: Map<string, ComponentNode>,
) {
  return currentNodes.filter((n) => {
    return n.id !== nodeId &&
      CONTAINER_TYPES.has(n.data.componentType) &&
      isValidNesting(componentType, n.data.componentType) &&
      isPointInsideContainerArea(n, point, nodeMap, true);
  }) as ComponentNode[];
}

function CanvasInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, setCenter, getZoom } = useReactFlow();


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

  const onNodeDragStart = useCallback((event: React.MouseEvent, draggedNode: ComponentNode) => {
    const state = useCanvasStore.getState();
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
    const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const nodeAbs = getAbsolutePosition(draggedNode, nodeMap);
    const grabOffset = { x: pointer.x - nodeAbs.x, y: pointer.y - nodeAbs.y };
    state.pushSnapshot();
    state.setActiveDrag(draggedNode.id, draggedNode.parentId ?? null, grabOffset);
    state.setDragContainerHints(draggedNode.parentId ?? null, null, null);
  }, [screenToFlowPosition]);

  const onNodeDrag = useCallback((event: React.MouseEvent, draggedNode: ComponentNode) => {
    const state = useCanvasStore.getState();
    const { nodes: currentNodes, setDragContainerHints } = state;
    const currentNode = currentNodes.find((n) => n.id === draggedNode.id) ?? draggedNode;
    const nodeMap = new Map(currentNodes.map((n) => [n.id, n]));
    const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const grabOff = state.dragGrabOffset ?? { x: 0, y: 0 };
    const nodeAbsPos = { x: pointer.x - grabOff.x, y: pointer.y - grabOff.y };
    const validContainers = getValidContainersAtPoint(currentNode.data.componentType, currentNode.id, pointer, currentNodes, nodeMap);
    const targetContainer = validContainers.length > 0 ? pickInnermostContainer(validContainers) : null;

    // Helper: set node position directly
    const setPos = (pos: { x: number; y: number }, extraProps?: Partial<ComponentNode>) => {
      useCanvasStore.setState((s) => ({
        nodes: s.nodes.map((n) => {
          if (n.id !== currentNode.id) return n;
          return { ...n, ...extraProps, position: pos };
        }),
      }));
    };

    // Helper: detach node (remove parentId/extent)
    const detachWithPos = (pos: { x: number; y: number }) => {
      useCanvasStore.setState((s) => ({
        nodes: s.nodes.map((n) => {
          if (n.id !== currentNode.id) return n;
          const { parentId: _p, extent: _e, ...rest } = n as ComponentNode & { extent?: string };
          void _p; void _e;
          return { ...rest, position: pos } as ComponentNode;
        }),
      }));
    };

    // --- Node is on canvas (no parent) ---
    if (!currentNode.parentId) {
      setPos(nodeAbsPos);
      if (targetContainer) {
        // Cursor inside a container → live-attach
        const tAbs = getAbsolutePosition(targetContainer, nodeMap);
        setPos({ x: nodeAbsPos.x - tAbs.x, y: nodeAbsPos.y - tAbs.y }, { parentId: targetContainer.id });
        setDragContainerHints(targetContainer.id, null, null);
      } else {
        setPos(nodeAbsPos);
        setDragContainerHints(null, null, null);
      }
      return;
    }

    // --- Node is inside a container ---
    const parent = currentNodes.find((n) => n.id === currentNode.parentId);
    if (!parent) return;

    const sourceContainerId = currentNode.parentId;
    const parentAbs = getAbsolutePosition(parent, nodeMap);
    const relPos = { x: nodeAbsPos.x - parentAbs.x, y: nodeAbsPos.y - parentAbs.y };

    if (targetContainer && targetContainer.id !== sourceContainerId) {
      // Cursor moved to a different container → live-reparent
      const tAbs = getAbsolutePosition(targetContainer, nodeMap);
      setPos({ x: nodeAbsPos.x - tAbs.x, y: nodeAbsPos.y - tAbs.y }, { parentId: targetContainer.id });
      setDragContainerHints(targetContainer.id, null, null);
    } else if (!targetContainer) {
      // Cursor outside all containers → live-detach
      detachWithPos(nodeAbsPos);
      setDragContainerHints(null, null, null);
    } else {
      // Still in same container → update relative position freely
      setPos(relPos);
      setDragContainerHints(sourceContainerId, null, null);
    }
  }, [screenToFlowPosition]);

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, _draggedNode: ComponentNode) => {
      const store = useCanvasStore.getState();
      const { clearDragContainerHints, clearActiveDrag } = store;

      // onNodeDrag already handled all reparenting/detaching live.
      // Just normalize (auto-expand containers) and clean up.
        store.normalizeNodes();
      clearDragContainerHints();
      clearActiveDrag();
    },
    [],
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
        if (def.defaultConfig) {
          Object.assign(defaultConfig, def.defaultConfig);
        }
      }

      // Auto-parent: find container under the drop point
      const currentNodes = useCanvasStore.getState().nodes;
      const nodeMap = new Map(currentNodes.map(n => [n.id, n]));

      const hitContainers = currentNodes.filter(n => {
        if (!CONTAINER_TYPES.has(n.data.componentType)) return false;
        if (!isValidNesting(componentType, n.data.componentType)) return false;
        return isPointInsideContainerArea(n, position, nodeMap, true);
      });

      let parentId: string | undefined;
      let adjustedPosition = position;

      if (hitContainers.length > 0) {
        const target = pickInnermostContainer(hitContainers);
        parentId = target.id;
        const parentAbs = getAbsolutePosition(target, nodeMap);
        adjustedPosition = {
          x: Math.max(CONFIG.CANVAS.CONTAINER_PADDING_LEFT, position.x - parentAbs.x),
          y: Math.max(CONFIG.CANVAS.CONTAINER_PADDING_TOP, position.y - parentAbs.y),
        };
      }

      const newNode: ComponentNode = {
        id: getNextId(),
        type: nodeType,
        position: adjustedPosition,
        data: {
          label: sanitizeLabel(label),
          componentType,
          category,
          icon,
          config: defaultConfig,
        } satisfies ComponentNodeData,
        ...(isContainer ? { style: { width: CONFIG.CANVAS.CONTAINER_DEFAULT_WIDTH, height: CONFIG.CANVAS.CONTAINER_DEFAULT_HEIGHT }, dragHandle: '.container-drag-handle', zIndex: CONTAINER_Z_INDEX[componentType] ?? -1 } : {}),
        ...(parentId ? { parentId } : {}),
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
    <div
      ref={reactFlowWrapper}
      className="w-full h-full relative"
      style={{
        backgroundImage:
          'radial-gradient(circle at top, rgba(110,220,255,0.08), transparent 24%), radial-gradient(circle at 80% 18%, rgba(255,180,84,0.06), transparent 18%)',
      }}
    >
      <Toolbar />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
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
        snapGrid={[CONFIG.CANVAS.SNAP_GRID, CONFIG.CANVAS.SNAP_GRID]}
        defaultEdgeOptions={{
          type: 'flow',
          style: { stroke: '#3b82f6', strokeWidth: CONFIG.CANVAS.DEFAULT_EDGE_STROKE_WIDTH },
        }}
        elevateNodesOnSelect={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(110,220,255,0.22)" />
        <Controls className="!bg-[rgba(19,32,44,0.92)] !border-[var(--color-border)] !rounded-xl !shadow-[var(--shadow-panel)] [&>button]:!bg-[rgba(19,32,44,0.92)] [&>button]:!border-[var(--color-border)] [&>button]:!text-slate-300 [&>button:hover]:!bg-[var(--color-surface-hover)]" />
        <MiniMap
          className="!bg-[rgba(19,32,44,0.95)] !border-[var(--color-border)] !rounded-xl !shadow-[var(--shadow-panel)]"
          nodeColor={(node) => getMiniMapNodeColor(node as ComponentNode)}
          maskColor="rgba(8,16,24,0.84)"
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
