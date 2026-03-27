import { getDefinition } from '@system-design-sandbox/component-library';

import { useCanvasStore } from '../../store/canvasStore.ts';
import type { EdgeRoutingRule } from '../../types/index.ts';
import { getNodeTags } from '../../utils/nodeTags.ts';
import { CacheRulesEditor, EdgeRoutingRulesEditor, ResponseRulesEditor, TagDistributionEditor } from './PropertiesPanel.tsx';

const CLIENT_TYPES = new Set(['web_client', 'mobile_client', 'external_api']);

interface CacheRuleEntry { tag: string; hitRatio: number; capacityMb: number }
interface ResponseRuleEntry { tag: string; responseSizeKb: number }
interface TagWeightEntry { tag: string; weight: number; requestSizeKb?: number }

function NodeTagsEditor() {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const updateNodeConfig = useCanvasStore((s) => s.updateNodeConfig);

  const node = nodes.find(n => n.id === selectedNodeId);
  if (!node) return null;

  const config = node.data.config;
  const componentType = node.data.componentType;
  const def = getDefinition(componentType as Parameters<typeof getDefinition>[0]);
  const name = (config.name as string) || node.data.label;

  // Client — tagDistribution
  if (CLIENT_TYPES.has(componentType)) {
    return (
      <div className="p-3">
        <div className="text-xs font-semibold text-slate-200 mb-2">{name}</div>
        <TagDistributionEditor
          nodeId={node.id}
          tags={(config.tagDistribution as TagWeightEntry[] | undefined) ?? []}
          updateNodeConfig={updateNodeConfig}
        />
      </div>
    );
  }

  // CDN — cacheRules
  if (componentType === 'cdn') {
    return (
      <div className="p-3">
        <div className="text-xs font-semibold text-slate-200 mb-2">{name}</div>
        <CacheRulesEditor
          nodeId={node.id}
          rules={(config.cacheRules as CacheRuleEntry[] | undefined) ?? (def?.defaultConfig?.cacheRules as CacheRuleEntry[] | undefined) ?? []}
          updateNodeConfig={updateNodeConfig}
        />
      </div>
    );
  }

  // S3 — responseRules
  if (componentType === 's3' || config.responseRules || def?.defaultConfig?.responseRules) {
    return (
      <div className="p-3">
        <div className="text-xs font-semibold text-slate-200 mb-2">{name}</div>
        <ResponseRulesEditor
          nodeId={node.id}
          rules={(config.responseRules as ResponseRuleEntry[] | undefined) ?? (def?.defaultConfig?.responseRules as ResponseRuleEntry[] | undefined) ?? []}
          updateNodeConfig={updateNodeConfig}
        />
      </div>
    );
  }

  // LB — blockedTags
  if (componentType === 'load_balancer') {
    const blocked = (config.blockedTags as string[] | undefined) ?? [];
    const blockedSet = new Set(blocked);
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const allTags = new Set<string>();
    for (const e of edges) {
      if (e.target === node.id || e.source === node.id) {
        const other = nodeMap.get(e.target === node.id ? e.source : e.target);
        if (other) { const t = getNodeTags(other); if (t) t.forEach(tag => allTags.add(tag)); }
      }
    }

    const toggleBlock = (tag: string) => {
      const newBlocked = blockedSet.has(tag) ? blocked.filter(t => t !== tag) : [...blocked, tag];
      updateNodeConfig(node.id, { blockedTags: newBlocked.length > 0 ? newBlocked : undefined });
    };

    return (
      <div className="p-3">
        <div className="text-xs font-semibold text-slate-200 mb-2">{name} — Tag Filter</div>
        {allTags.size > 0 ? (
          <div className="space-y-1">
            {[...allTags].sort().map(tag => {
              const isBlocked = blockedSet.has(tag);
              return (
                <div key={tag} className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${isBlocked ? 'bg-rose-500/8 border border-rose-500/16' : 'bg-[rgba(7,12,19,0.28)] border border-[rgba(138,167,198,0.08)]'}`}>
                  <button
                    onClick={() => toggleBlock(tag)}
                    title={isBlocked ? 'Unblock tag' : 'Block tag'}
                    className={`w-5 h-5 shrink-0 rounded text-[10px] font-bold flex items-center justify-center transition-colors ${isBlocked ? 'bg-red-900/40 text-red-400 hover:bg-red-900/60' : 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50'}`}
                  >{isBlocked ? '✕' : '✓'}</button>
                  <span className={`text-xs font-medium ${isBlocked ? 'text-rose-300/60 line-through' : 'text-slate-200'}`}>{tag}</span>
                  {isBlocked && <span className="text-[9px] font-semibold uppercase tracking-wider text-rose-400/70 ml-auto">blocked</span>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-slate-500">Wildcard — all tags pass through</div>
        )}
      </div>
    );
  }

  // Other nodes — show what tags they accept
  const tags = getNodeTags(node);
  return (
    <div className="p-3">
      <div className="text-xs font-semibold text-slate-200 mb-2">{name}</div>
      <div className="text-xs text-slate-500">
        {tags ? `Accepts: ${tags.join(', ')}` : 'Wildcard — accepts any tag'}
      </div>
    </div>
  );
}

function EdgeTagsEditor() {
  const selectedEdgeId = useCanvasStore((s) => s.selectedEdgeId);
  const edges = useCanvasStore((s) => s.edges);
  const nodes = useCanvasStore((s) => s.nodes);
  const updateEdgeData = useCanvasStore((s) => s.updateEdgeData);

  const edge = edges.find(e => e.id === selectedEdgeId);
  if (!edge) return null;

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const src = nodeMap.get(edge.source);
  const tgt = nodeMap.get(edge.target);
  const srcName = src ? ((src.data.config.name as string) || src.data.label) : edge.source;
  const tgtName = tgt ? ((tgt.data.config.name as string) || tgt.data.label) : edge.target;

  return (
    <div className="p-3">
      <div className="text-xs font-semibold text-slate-200 mb-2">{srcName} → {tgtName}</div>
      <EdgeRoutingRulesEditor
        edgeId={edge.id}
        rules={(edge.data?.routingRules as EdgeRoutingRule[] | undefined) ?? []}
        updateEdgeData={updateEdgeData}
        sourceNode={src}
        targetNode={tgt}
        allEdges={edges}
      />
    </div>
  );
}

function AllTagsSummary() {
  const nodes = useCanvasStore((s) => s.nodes);
  const tagSources = new Map<string, string[]>();

  for (const node of nodes) {
    const tags = getNodeTags(node);
    if (tags) {
      const name = (node.data.config.name as string) || node.data.label;
      for (const t of tags) {
        if (!tagSources.has(t)) tagSources.set(t, []);
        tagSources.get(t)!.push(name);
      }
    }
  }

  if (tagSources.size === 0) {
    return <div className="p-4 text-xs text-slate-500">No tags defined. Add tagDistribution to clients or cacheRules to CDN nodes.</div>;
  }

  return (
    <div className="p-3 space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">All Tags in Architecture</div>
      {[...tagSources.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([tag, sources]) => (
        <div key={tag} className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-900/20 text-cyan-400 border border-cyan-800/30">{tag}</span>
          <span className="text-[10px] text-slate-500 truncate">{sources.join(', ')}</span>
        </div>
      ))}
    </div>
  );
}

export function TagsPanel() {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const selectedEdgeId = useCanvasStore((s) => s.selectedEdgeId);

  if (selectedEdgeId) return <EdgeTagsEditor />;
  if (selectedNodeId) return <NodeTagsEditor />;
  return <AllTagsSummary />;
}
