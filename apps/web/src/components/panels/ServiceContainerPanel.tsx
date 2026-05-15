import { useState } from 'react';

import { useCanvasStore } from '../../store/canvasStore.ts';
import type {
  ComponentNode,
  DbPoolConfig,
  OnDemandConnConfig,
  PersistentConnConfig,
  Pipeline,
  PipelineCall,
  PipelineStep,
  ProducerConfig,
  ServiceContainerConfig,
} from '../../types/index.ts';

// ── Shared resources helper type ──────────────────────────────────────────────

interface SharedResources {
  dbPools: DbPoolConfig[];
  persistentConns: PersistentConnConfig[];
  producers: ProducerConfig[];
  onDemandConns: OnDemandConnConfig[];
}

// ── Defaults ─────────────────────────────────────────────────────────────────

function makeDefaultPipeline(id: string): Pipeline {
  return {
    id,
    label: `pipeline-${id}`,
    trigger: { kind: 'router', protocol: 'REST', port: 8080, acceptedTags: [] },
    steps: [{
      id: 'step-1',
      processingDelay: 0.2,
      description: '',
      calls: [],
      responseSizeKb: 0.5,
    }],
  };
}

function makeDefaultDbPool(id: string): DbPoolConfig {
  return { id, label: `db-pool-${id}`, targetNodeId: '', poolSize: 10, queryDelay: 5 };
}

function makeDefaultPersistentConn(id: string): PersistentConnConfig {
  return { id, label: `persistent-${id}`, targetNodeId: '', pipelined: false, cmdDelay: 0.5 };
}

function makeDefaultProducer(id: string): ProducerConfig {
  return { id, label: `producer-${id}`, targetNodeId: '', topic: '', acks: 'leader', batchMode: false };
}

function makeDefaultOnDemand(id: string): OnDemandConnConfig {
  return { id, label: `ondemand-${id}`, targetNodeId: '', setupDelay: 50, keepAlive: false, requestDelay: 200 };
}

function nanoid(): string {
  return Math.random().toString(36).slice(2, 8);
}

function makeDefaultServiceContainerConfig(): ServiceContainerConfig {
  const pid = nanoid();
  return {
    dbPools: [],
    persistentConns: [],
    producers: [],
    onDemandConns: [],
    pipelines: [makeDefaultPipeline(pid)],
    internalLatency: 2,
    collapsed: true,
    rateLimitEnabled: false,
    rateLimitRps: 1000,
    rateLimitRedisNodeId: '',
  };
}

// ── Validation ───────────────────────────────────────────────────────────────

interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
}

function validateServiceConfig(cfg: ServiceContainerConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Duplicate Router ports
  const ports: number[] = [];
  for (const p of cfg.pipelines) {
    if (p.trigger.kind === 'router') {
      if (ports.includes(p.trigger.port)) {
        issues.push({ level: 'warning', message: `Duplicate Router port :${p.trigger.port}` });
      } else {
        ports.push(p.trigger.port);
      }
    }
  }

  // Consumer without broker
  for (const p of cfg.pipelines) {
    if (p.trigger.kind === 'consumer' && !p.trigger.sourceBrokerNodeId) {
      issues.push({ level: 'error', message: `Pipeline "${p.label}": Consumer trigger has no broker selected` });
    }
  }

  // Pipeline without steps
  for (const p of cfg.pipelines) {
    if (p.steps.length === 0) {
      issues.push({ level: 'error', message: `Pipeline "${p.label}": must have at least one step` });
    }
  }

  // DB Pool without target
  for (const d of cfg.dbPools) {
    if (!d.targetNodeId) {
      issues.push({ level: 'warning', message: `DB Pool "${d.label}": no target node selected` });
    }
  }

  // Persistent conn without target
  for (const c of cfg.persistentConns) {
    if (!c.targetNodeId) {
      issues.push({ level: 'warning', message: `Persistent Conn "${c.label}": no target node selected` });
    }
  }

  // Producer without broker
  for (const p of cfg.producers) {
    if (!p.targetNodeId) {
      issues.push({ level: 'warning', message: `Producer "${p.label}": no broker selected` });
    }
    if (!p.topic) {
      issues.push({ level: 'warning', message: `Producer "${p.label}": topic is empty` });
    }
  }

  // On-demand conn without target
  for (const o of cfg.onDemandConns) {
    if (!o.targetNodeId) {
      issues.push({ level: 'warning', message: `On-demand Conn "${o.label}": no target node selected` });
    }
  }

  return issues;
}

// ── Helper types ─────────────────────────────────────────────────────────────

const DB_TYPES = new Set(['postgresql', 'mysql', 'mongodb', 'cassandra', 'clickhouse', 'elasticsearch', 'redis', 'memcached', 's3', 'etcd']);
const REDIS_LIKE_TYPES = new Set(['redis', 'memcached']);
const BROKER_TYPES = new Set(['kafka', 'rabbitmq', 'nats']);

// ── Sub-components ────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-md border border-[var(--color-border)] bg-[rgba(7,12,19,0.40)] px-2 py-1 text-sm text-slate-200 outline-none focus:border-[var(--color-accent)] transition-colors [&>option]:bg-[#1e293b] [&>option]:text-slate-200';
const labelCls = 'text-[10px] text-slate-500 block mb-0.5';
const btnSmCls = 'text-[10px] px-2 py-1 rounded border border-[var(--color-border)] bg-[rgba(255,255,255,0.04)] text-slate-400 hover:bg-[rgba(255,255,255,0.08)] hover:text-slate-200 transition-colors cursor-pointer';
const sectionCls = 'rounded-lg border border-[var(--color-border)] bg-[rgba(7,12,19,0.18)] overflow-hidden';

// Call row
const CALL_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  db:         { bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.25)',  text: '#4ade80' },
  persistent: { bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.25)', text: '#fbbf24' },
  producer:   { bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.25)', text: '#a78bfa' },
  ondemand:   { bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.25)', text: '#fb923c' },
};

const callInputCls = 'w-12 text-[10px] rounded border border-[var(--color-border)] bg-[rgba(7,12,19,0.40)] px-1 py-0.5 text-slate-300 text-center';

function CallRow({ call, resources, onChange, onRemove }: {
  call: PipelineCall;
  resources: SharedResources;
  onChange: (c: PipelineCall) => void;
  onRemove: () => void;
}) {
  const getLabel = () => {
    if (call.kind === 'db') {
      const r = resources.dbPools.find(d => d.id === call.resourceId);
      return `\u21c4 DB: ${r?.label ?? call.resourceId}`;
    }
    if (call.kind === 'persistent') {
      const r = resources.persistentConns.find(d => d.id === call.resourceId);
      return `\u26a1 ${r?.label ?? call.resourceId}`;
    }
    if (call.kind === 'producer') {
      const r = resources.producers.find(d => d.id === call.resourceId);
      return `\ud83d\udce4 ${(r?.topic || r?.label) ?? call.resourceId}`;
    }
    const r = resources.onDemandConns.find(d => d.id === call.resourceId);
    return `\ud83c\udf10 ${r?.label ?? call.resourceId}`;
  };

  const c = CALL_COLORS[call.kind] ?? CALL_COLORS.ondemand;

  return (
    <div className="rounded px-2 py-1.5 space-y-1"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      {/* Header: label + delete */}
      <div className="flex items-center gap-1.5">
        <span className="flex-1 text-[10px] font-mono truncate" style={{ color: c.text }}>{getLabel()}</span>
        <button onClick={onRemove} className="text-[9px] text-slate-600 hover:text-slate-300 transition-colors cursor-pointer" title="Remove call">{'\u2715'}</button>
      </div>
      {/* Controls row */}
      {call.kind === 'db' && (
        <div className="flex items-center gap-2 flex-wrap text-[9px] text-slate-400">
          <label className="flex items-center gap-1">
            <span>Queries</span>
            <input type="number" value={call.count} min={1} max={100}
              onChange={e => onChange({ ...call, count: Number(e.target.value) } as PipelineCall)}
              className={callInputCls} />
          </label>
          <label className="flex items-center gap-1 cursor-pointer" title="Execute queries in parallel (total latency = 1 query) instead of sequentially (total = N queries)">
            <input type="checkbox" checked={call.parallel}
              onChange={e => onChange({ ...call, parallel: e.target.checked } as PipelineCall)}
              className="w-3 h-3" />
            <span>parallel</span>
          </label>
          <label className="flex items-center gap-1" title="Query payload sent to DB">
            <span>req</span>
            <input type="number" value={call.requestSizeKb ?? 0.1} min={0.01} max={10240} step={0.01}
              onChange={e => onChange({ ...call, requestSizeKb: Number(e.target.value) } as PipelineCall)}
              className={callInputCls} />
          </label>
          <label className="flex items-center gap-1" title="Result set returned from DB">
            <span>resp</span>
            <input type="number" value={call.responseSizeKb ?? 2} min={0.01} max={102400} step={0.1}
              onChange={e => onChange({ ...call, responseSizeKb: Number(e.target.value) } as PipelineCall)}
              className={callInputCls} />
            <span>KB</span>
          </label>
        </div>
      )}
      {call.kind === 'persistent' && (
        <div className="flex items-center gap-2 flex-wrap text-[9px] text-slate-400">
          <label className="flex items-center gap-1">
            <span>Commands</span>
            <input type="number" value={call.count} min={1} max={100}
              onChange={e => onChange({ ...call, count: Number(e.target.value) } as PipelineCall)}
              className={callInputCls} />
          </label>
          <label className="flex items-center gap-1" title="Command payload">
            <span>req</span>
            <input type="number" value={call.requestSizeKb ?? 0.05} min={0.01} max={10240} step={0.01}
              onChange={e => onChange({ ...call, requestSizeKb: Number(e.target.value) } as PipelineCall)}
              className={callInputCls} />
          </label>
          <label className="flex items-center gap-1" title="Response payload">
            <span>resp</span>
            <input type="number" value={call.responseSizeKb ?? 0.5} min={0.01} max={102400} step={0.1}
              onChange={e => onChange({ ...call, responseSizeKb: Number(e.target.value) } as PipelineCall)}
              className={callInputCls} />
            <span>KB</span>
          </label>
        </div>
      )}
      {call.kind === 'producer' && (
        <div className="flex items-center gap-2 text-[9px] text-slate-400">
          <label className="flex items-center gap-1">
            <span>Payload</span>
            <input type="number" value={call.payloadSize} min={0.1} max={10240} step={0.1}
              onChange={e => onChange({ ...call, payloadSize: Number(e.target.value) } as PipelineCall)}
              className={callInputCls} />
            <span>KB</span>
          </label>
        </div>
      )}
      {call.kind === 'ondemand' && (
        <div className="flex items-center gap-2 text-[9px] text-slate-400">
          <label className="flex items-center gap-1" title="Request payload to external service">
            <span>req</span>
            <input type="number" value={call.requestSizeKb ?? 1} min={0.01} max={10240} step={0.1}
              onChange={e => onChange({ ...call, requestSizeKb: Number(e.target.value) } as PipelineCall)}
              className={callInputCls} />
          </label>
          <label className="flex items-center gap-1" title="Response from external service">
            <span>resp</span>
            <input type="number" value={call.responseSizeKb ?? 1} min={0.01} max={102400} step={0.1}
              onChange={e => onChange({ ...call, responseSizeKb: Number(e.target.value) } as PipelineCall)}
              className={callInputCls} />
            <span>KB</span>
          </label>
        </div>
      )}
    </div>
  );
}

// Step editor
function StepEditor({ step, onChange, onRemove, canRemove, resources }: {
  step: PipelineStep;
  onChange: (s: PipelineStep) => void;
  onRemove: () => void;
  canRemove: boolean;
  resources: SharedResources;
}) {
  return (
    <div className="p-2 rounded-md border border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.15)] space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={step.description}
          placeholder="Step description"
          onChange={e => onChange({ ...step, description: e.target.value })}
          className={`flex-1 ${inputCls}`}
        />
        {canRemove && (
          <button onClick={onRemove} className={btnSmCls} title="Remove step">✕</button>
        )}
      </div>
      <div>
        <label className={labelCls}>Processing delay (ms)</label>
        <input
          type="number"
          value={step.processingDelay}
          min={0} max={10000} step={0.1}
          onChange={e => onChange({ ...step, processingDelay: Number(e.target.value) })}
          className={inputCls}
        />
      </div>

      {/* Response — if this step returns a response to the caller. Empty = no response on this step. */}
      <div>
        <label className={labelCls}>Response to caller (KB, empty = no response on this step)</label>
        <input
          type="number"
          value={step.responseSizeKb ?? ''}
          min={0.01} max={102400} step={0.1}
          placeholder="—"
          onChange={e => {
            const v = e.target.value;
            onChange({ ...step, responseSizeKb: v ? Number(v) : undefined });
          }}
          className={inputCls}
        />
      </div>

      {/* Calls */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] uppercase tracking-[0.15em] text-slate-500 font-semibold">Calls to resources</span>
          <select
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              const [kind, resourceId] = val.split(':');
              let newCall: PipelineCall;
              if (kind === 'db') newCall = { kind: 'db', resourceId, count: 1, parallel: false };
              else if (kind === 'persistent') newCall = { kind: 'persistent', resourceId, count: 1 };
              else if (kind === 'producer') newCall = { kind: 'producer', resourceId, payloadSize: 0.5 };
              else newCall = { kind: 'ondemand', resourceId };
              onChange({ ...step, calls: [...step.calls, newCall] });
              e.target.value = '';
            }}
            className="text-[9px] rounded border border-[var(--color-border)] bg-[rgba(7,12,19,0.40)] px-1.5 py-0.5 text-slate-400 cursor-pointer [&>option]:bg-[#1e293b] [&>option]:text-slate-200"
          >
            <option value="">+ add call</option>
            {resources.dbPools.map(r => <option key={r.id} value={`db:${r.id}`}>DB: {r.label}</option>)}
            {resources.persistentConns.map(r => <option key={r.id} value={`persistent:${r.id}`}>{'\u26a1'} {r.label}</option>)}
            {resources.producers.map(r => <option key={r.id} value={`producer:${r.id}`}>{'\ud83d\udce4'} {r.topic || r.label}</option>)}
            {resources.onDemandConns.map(r => <option key={r.id} value={`ondemand:${r.id}`}>{'\ud83c\udf10'} {r.label}</option>)}
          </select>
        </div>
        {step.calls.length > 0 && (
          <div className="space-y-1">
            {step.calls.map((call, ci) => (
              <CallRow
                key={ci}
                call={call}
                resources={resources}
                onChange={(updated) => {
                  const calls = [...step.calls];
                  calls[ci] = updated;
                  onChange({ ...step, calls });
                }}
                onRemove={() => {
                  onChange({ ...step, calls: step.calls.filter((_, i) => i !== ci) });
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Pipeline editor
function PipelineEditor({ pipeline, onChange, onRemove, canRemove, allNodes, resources }: {
  pipeline: Pipeline;
  onChange: (p: Pipeline) => void;
  onRemove: () => void;
  canRemove: boolean;
  allNodes: ComponentNode[];
  resources: SharedResources;
}) {
  const [open, setOpen] = useState(true);
  const trigger = pipeline.trigger;

  const brokerNodes = allNodes.filter(n => BROKER_TYPES.has(n.data.componentType));

  const updateTrigger = (patch: Partial<typeof trigger>) => {
    onChange({ ...pipeline, trigger: { ...trigger, ...patch } as typeof trigger });
  };

  const updateStep = (idx: number, step: PipelineStep) => {
    const steps = [...pipeline.steps];
    steps[idx] = step;
    onChange({ ...pipeline, steps });
  };

  const addStep = () => {
    const newStep: PipelineStep = {
      id: nanoid(),
      processingDelay: 0.2,
      description: '',
      calls: [],
    };
    onChange({ ...pipeline, steps: [...pipeline.steps, newStep] });
  };

  const removeStep = (idx: number) => {
    onChange({ ...pipeline, steps: pipeline.steps.filter((_, i) => i !== idx) });
  };

  return (
    <div className={sectionCls}>
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[rgba(255,255,255,0.02)]"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">{open ? '▾' : '▸'}</span>
          <input
            type="text"
            value={pipeline.label}
            onClick={e => e.stopPropagation()}
            onChange={e => onChange({ ...pipeline, label: e.target.value })}
            className="bg-transparent text-[11px] font-mono text-slate-200 outline-none border-b border-transparent focus:border-[var(--color-accent)] w-32"
          />
          <span className="text-[10px] text-slate-500">
            {trigger.kind === 'router'
              ? `${trigger.protocol}:${trigger.port}`
              : `consumer → ${trigger.topic || '(topic)'}`}
          </span>
        </div>
        {canRemove && (
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className={btnSmCls}
            title="Remove pipeline"
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-[var(--color-border)]">
          {/* Trigger */}
          <div className="pt-2 space-y-2">
            <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500 font-semibold">Trigger</div>
            <div className="flex gap-2">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  checked={trigger.kind === 'router'}
                  onChange={() => onChange({ ...pipeline, trigger: { kind: 'router', protocol: 'REST', port: 8080, acceptedTags: [] } })}
                  className="w-3 h-3"
                />
                <span className="text-[11px] text-slate-300">Router</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  checked={trigger.kind === 'consumer'}
                  onChange={() => onChange({ ...pipeline, trigger: { kind: 'consumer', sourceBrokerNodeId: '', topic: '', consumerGroup: 'default', concurrency: 1, ackMode: 'auto' } })}
                  className="w-3 h-3"
                />
                <span className="text-[11px] text-slate-300">Consumer</span>
              </label>
            </div>

            {trigger.kind === 'router' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Protocol</label>
                    <select
                      value={trigger.protocol}
                      onChange={e => updateTrigger({ protocol: e.target.value as 'REST' | 'WS' | 'gRPC' })}
                      className={inputCls}
                    >
                      <option value="REST">REST</option>
                      <option value="WS">WebSocket</option>
                      <option value="gRPC">gRPC</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Port</label>
                    <input
                      type="number"
                      value={trigger.port}
                      min={1} max={65535}
                      onChange={e => updateTrigger({ port: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Accepted tags (comma-separated, empty = all)</label>
                  <input
                    type="text"
                    value={(trigger.acceptedTags ?? []).join(', ')}
                    placeholder="e.g. web, api, mobile"
                    onChange={e => {
                      const raw = e.target.value;
                      const tags = raw ? raw.split(',').map(t => t.trim()).filter(Boolean) : [];
                      updateTrigger({ acceptedTags: tags });
                    }}
                    className={inputCls}
                  />
                  {trigger.acceptedTags?.length === 0 && (
                    <span className="text-[9px] text-slate-500 mt-0.5 block">Wildcard — accepts all traffic tags</span>
                  )}
                </div>
              </div>
            )}

            {trigger.kind === 'consumer' && (
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>Broker</label>
                  <select
                    value={trigger.sourceBrokerNodeId}
                    onChange={e => updateTrigger({ sourceBrokerNodeId: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">— select broker —</option>
                    {brokerNodes.map(n => (
                      <option key={n.id} value={n.id}>
                        {(n.data.config.name as string) || n.data.label} ({n.data.componentType})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Topic</label>
                    <input
                      type="text"
                      value={trigger.topic}
                      onChange={e => updateTrigger({ topic: e.target.value })}
                      className={inputCls}
                      placeholder="orders.created"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Group</label>
                    <input
                      type="text"
                      value={trigger.consumerGroup}
                      onChange={e => updateTrigger({ consumerGroup: e.target.value })}
                      className={inputCls}
                      placeholder="default"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Concurrency</label>
                    <input
                      type="number"
                      value={trigger.concurrency}
                      min={1} max={100}
                      onChange={e => updateTrigger({ concurrency: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Ack Mode</label>
                    <select
                      value={trigger.ackMode}
                      onChange={e => updateTrigger({ ackMode: e.target.value as 'auto' | 'manual' })}
                      className={inputCls}
                    >
                      <option value="auto">Auto</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Steps */}
          <div className="space-y-2">
            <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500 font-semibold">Steps</div>
            {pipeline.steps.map((step, idx) => (
              <StepEditor
                key={step.id}
                step={step}
                onChange={s => updateStep(idx, s)}
                onRemove={() => removeStep(idx)}
                canRemove={pipeline.steps.length > 1}
                resources={resources}
              />
            ))}
            <button onClick={addStep} className={`w-full ${btnSmCls} py-1.5`}>
              + Add Step
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Resource list editors
function DbPoolsList({ pools, onChange, dbNodes, nodeId }: { pools: DbPoolConfig[]; onChange: (p: DbPoolConfig[]) => void; dbNodes: ComponentNode[]; nodeId: string }) {
  const add = () => onChange([...pools, makeDefaultDbPool(nanoid())]);
  const remove = (id: string) => onChange(pools.filter(p => p.id !== id));
  const update = (id: string, patch: Partial<DbPoolConfig>) => {
    onChange(pools.map(p => p.id === id ? { ...p, ...patch } : p));
    if ('targetNodeId' in patch) {
      const handleId = `dbpool:${id}`;
      const cs = useCanvasStore.getState();
      cs.removeEdgesWhere(e => e.source === nodeId && (e.sourceHandle ?? null) === handleId);
      if (patch.targetNodeId) {
        cs.onConnect({ source: nodeId, target: patch.targetNodeId, sourceHandle: handleId, targetHandle: null });
      }
    }
  };

  return (
    <div className="space-y-2">
      {pools.map(pool => (
        <div key={pool.id} className="p-2 rounded border border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.15)] space-y-1.5">
          <div className="flex gap-2">
            <input
              type="text"
              value={pool.label}
              placeholder="Label"
              onChange={e => update(pool.id, { label: e.target.value })}
              className={`flex-1 ${inputCls}`}
            />
            <button onClick={() => remove(pool.id)} className={btnSmCls}>✕</button>
          </div>
          <div>
            <label className={labelCls}>Target DB</label>
            <select value={pool.targetNodeId} onChange={e => update(pool.id, { targetNodeId: e.target.value })} className={inputCls}>
              <option value="">— select node —</option>
              {dbNodes.map(n => <option key={n.id} value={n.id}>{(n.data.config.name as string) || n.data.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Pool size</label>
              <input type="number" value={pool.poolSize} min={1} max={1000} onChange={e => update(pool.id, { poolSize: Number(e.target.value) })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Query delay (ms)</label>
              <input type="number" value={pool.queryDelay} min={0.1} max={10000} step={0.1} onChange={e => update(pool.id, { queryDelay: Number(e.target.value) })} className={inputCls} />
            </div>
          </div>
        </div>
      ))}
      <button onClick={add} className={`w-full ${btnSmCls} py-1.5`}>+ Add DB Pool</button>
    </div>
  );
}

function PersistentConnsList({ conns, onChange, targetNodes, nodeId }: { conns: PersistentConnConfig[]; onChange: (c: PersistentConnConfig[]) => void; targetNodes: ComponentNode[]; nodeId: string }) {
  const add = () => onChange([...conns, makeDefaultPersistentConn(nanoid())]);
  const remove = (id: string) => onChange(conns.filter(c => c.id !== id));
  const update = (id: string, patch: Partial<PersistentConnConfig>) => {
    onChange(conns.map(c => c.id === id ? { ...c, ...patch } : c));
    if ('targetNodeId' in patch) {
      const handleId = `persistent:${id}`;
      const cs = useCanvasStore.getState();
      cs.removeEdgesWhere(e => e.source === nodeId && (e.sourceHandle ?? null) === handleId);
      if (patch.targetNodeId) {
        cs.onConnect({ source: nodeId, target: patch.targetNodeId, sourceHandle: handleId, targetHandle: null });
      }
    }
  };

  return (
    <div className="space-y-2">
      {conns.map(conn => (
        <div key={conn.id} className="p-2 rounded border border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.15)] space-y-1.5">
          <div className="flex gap-2">
            <input type="text" value={conn.label} placeholder="Label" onChange={e => update(conn.id, { label: e.target.value })} className={`flex-1 ${inputCls}`} />
            <button onClick={() => remove(conn.id)} className={btnSmCls}>✕</button>
          </div>
          <div>
            <label className={labelCls}>Target (Redis, etcd, …)</label>
            <select value={conn.targetNodeId} onChange={e => update(conn.id, { targetNodeId: e.target.value })} className={inputCls}>
              <option value="">— select node —</option>
              {targetNodes.map(n => <option key={n.id} value={n.id}>{(n.data.config.name as string) || n.data.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Cmd delay (ms)</label>
              <input type="number" value={conn.cmdDelay} min={0.01} max={1000} step={0.01} onChange={e => update(conn.id, { cmdDelay: Number(e.target.value) })} className={inputCls} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={conn.pipelined} onChange={e => update(conn.id, { pipelined: e.target.checked })} className="w-3 h-3 rounded" />
                <span className="text-[11px] text-slate-400">Pipelined</span>
              </label>
            </div>
          </div>
        </div>
      ))}
      <button onClick={add} className={`w-full ${btnSmCls} py-1.5`}>+ Add Persistent Conn</button>
    </div>
  );
}

function ProducersList({ producers, onChange, brokerNodes, nodeId }: { producers: ProducerConfig[]; onChange: (p: ProducerConfig[]) => void; brokerNodes: ComponentNode[]; nodeId: string }) {
  const add = () => onChange([...producers, makeDefaultProducer(nanoid())]);
  const remove = (id: string) => onChange(producers.filter(p => p.id !== id));
  const update = (id: string, patch: Partial<ProducerConfig>) => {
    onChange(producers.map(p => p.id === id ? { ...p, ...patch } : p));
    if ('targetNodeId' in patch) {
      const handleId = `producer:${id}`;
      const cs = useCanvasStore.getState();
      cs.removeEdgesWhere(e => e.source === nodeId && (e.sourceHandle ?? null) === handleId);
      if (patch.targetNodeId) {
        cs.onConnect({ source: nodeId, target: patch.targetNodeId, sourceHandle: handleId, targetHandle: null });
      }
    }
  };

  return (
    <div className="space-y-2">
      {producers.map(prod => (
        <div key={prod.id} className="p-2 rounded border border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.15)] space-y-1.5">
          <div className="flex gap-2">
            <input type="text" value={prod.label} placeholder="Label" onChange={e => update(prod.id, { label: e.target.value })} className={`flex-1 ${inputCls}`} />
            <button onClick={() => remove(prod.id)} className={btnSmCls}>✕</button>
          </div>
          <div>
            <label className={labelCls}>Broker</label>
            <select value={prod.targetNodeId} onChange={e => update(prod.id, { targetNodeId: e.target.value })} className={inputCls}>
              <option value="">— select broker —</option>
              {brokerNodes.map(n => <option key={n.id} value={n.id}>{(n.data.config.name as string) || n.data.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Topic</label>
              <input type="text" value={prod.topic} onChange={e => update(prod.id, { topic: e.target.value })} className={inputCls} placeholder="notifications" />
            </div>
            <div>
              <label className={labelCls}>Acks</label>
              <select value={prod.acks} onChange={e => update(prod.id, { acks: e.target.value as ProducerConfig['acks'] })} className={inputCls}>
                <option value="none">none (~0.1ms)</option>
                <option value="leader">leader (~2ms)</option>
                <option value="all">all (~10ms)</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={prod.batchMode} onChange={e => update(prod.id, { batchMode: e.target.checked })} className="w-3 h-3 rounded" />
            <span className="text-[11px] text-slate-400">Batch mode</span>
          </label>
        </div>
      ))}
      <button onClick={add} className={`w-full ${btnSmCls} py-1.5`}>+ Add Producer</button>
    </div>
  );
}

function OnDemandConnsList({ conns, onChange, allNodes, nodeId }: { conns: OnDemandConnConfig[]; onChange: (c: OnDemandConnConfig[]) => void; allNodes: ComponentNode[]; nodeId: string }) {
  const add = () => onChange([...conns, makeDefaultOnDemand(nanoid())]);
  const remove = (id: string) => onChange(conns.filter(c => c.id !== id));
  const update = (id: string, patch: Partial<OnDemandConnConfig>) => {
    onChange(conns.map(c => c.id === id ? { ...c, ...patch } : c));
    if ('targetNodeId' in patch) {
      const handleId = `ondemand:${id}`;
      const cs = useCanvasStore.getState();
      cs.removeEdgesWhere(e => e.source === nodeId && (e.sourceHandle ?? null) === handleId);
      if (patch.targetNodeId) {
        cs.onConnect({ source: nodeId, target: patch.targetNodeId, sourceHandle: handleId, targetHandle: null });
      }
    }
  };

  return (
    <div className="space-y-2">
      {conns.map(conn => (
        <div key={conn.id} className="p-2 rounded border border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.15)] space-y-1.5">
          <div className="flex gap-2">
            <input type="text" value={conn.label} placeholder="Label" onChange={e => update(conn.id, { label: e.target.value })} className={`flex-1 ${inputCls}`} />
            <button onClick={() => remove(conn.id)} className={btnSmCls}>✕</button>
          </div>
          <div>
            <label className={labelCls}>Target service/external node</label>
            <select value={conn.targetNodeId} onChange={e => update(conn.id, { targetNodeId: e.target.value })} className={inputCls}>
              <option value="">— select node —</option>
              {allNodes.map(n => <option key={n.id} value={n.id}>{(n.data.config.name as string) || n.data.label} ({n.data.componentType})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Setup delay (ms)</label>
              <input type="number" value={conn.setupDelay} min={0} max={5000} step={1} onChange={e => update(conn.id, { setupDelay: Number(e.target.value) })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Request delay (ms)</label>
              <input type="number" value={conn.requestDelay} min={0.1} max={60000} step={1} onChange={e => update(conn.id, { requestDelay: Number(e.target.value) })} className={inputCls} />
            </div>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={conn.keepAlive} onChange={e => update(conn.id, { keepAlive: e.target.checked })} className="w-3 h-3 rounded" />
            <span className="text-[11px] text-slate-400">Keep-Alive (no setup delay per request)</span>
          </label>
        </div>
      ))}
      <button onClick={add} className={`w-full ${btnSmCls} py-1.5`}>+ Add On-demand Conn</button>
    </div>
  );
}

// ── Section toggle wrapper ────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={sectionCls}>
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[rgba(255,255,255,0.02)] transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-warm)]">{title}</span>
        <span className="text-[10px] text-slate-500">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-[var(--color-border)]">
          <div className="pt-2">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ServiceContainerPanel({ node }: { node: ComponentNode }) {
  const updateNodeConfig = useCanvasStore((s) => s.updateNodeConfig);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const allNodes = useCanvasStore((s) => s.nodes).filter(n => n.id !== node.id);

  const cfg = node.data.config as unknown as ServiceContainerConfig;

  const dbNodes = allNodes.filter(n => DB_TYPES.has(n.data.componentType));
  const brokerNodes = allNodes.filter(n => BROKER_TYPES.has(n.data.componentType));
  const redisNodes = allNodes.filter(n => REDIS_LIKE_TYPES.has(n.data.componentType));
  const replicas = (node.data.config.replicas as number) ?? 1;

  const resources: SharedResources = {
    dbPools: cfg.dbPools,
    persistentConns: cfg.persistentConns,
    producers: cfg.producers,
    onDemandConns: cfg.onDemandConns,
  };

  const save = (patch: Partial<ServiceContainerConfig>) => {
    updateNodeConfig(node.id, { ...node.data.config, ...patch });
  };

  const issues = validateServiceConfig(cfg);

  const addPipeline = () => {
    save({ pipelines: [...cfg.pipelines, makeDefaultPipeline(nanoid())] });
  };

  const updatePipeline = (idx: number, p: Pipeline) => {
    const pipelines = [...cfg.pipelines];
    pipelines[idx] = p;
    save({ pipelines });
  };

  const removePipeline = (idx: number) => {
    save({ pipelines: cfg.pipelines.filter((_, i) => i !== idx) });
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* General */}
        <div className={sectionCls}>
          <div className="px-3 py-2 space-y-2">
            <div>
              <label className={labelCls}>Service name</label>
              <input
                type="text"
                value={(node.data.config.name as string) || node.data.label}
                onChange={e => updateNodeConfig(node.id, { name: e.target.value })}
                className={inputCls}
                placeholder="Service name"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Replicas</label>
                <input
                  type="number"
                  value={(node.data.config.replicas as number) ?? 1}
                  min={1} max={1000}
                  onChange={e => updateNodeConfig(node.id, { ...node.data.config, replicas: Number(e.target.value) })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Internal latency (μs)</label>
                <input
                  type="number"
                  value={cfg.internalLatency ?? 2}
                  min={0} max={1000} step={0.5}
                  onChange={e => save({ internalLatency: Number(e.target.value) })}
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        </div>

        {issues.length > 0 && (
          <div className="rounded-lg border border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.05)] px-3 py-2 space-y-1">
            {issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="shrink-0 text-[10px] mt-0.5">
                  {issue.level === 'error' ? '⚠' : '○'}
                </span>
                <span className={`text-[11px] ${issue.level === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {issue.message}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Rate Limiting */}
        <Section title="Rate Limiting" defaultOpen={!!cfg.rateLimitEnabled}>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.rateLimitEnabled ?? false}
                onChange={e => save({ rateLimitEnabled: e.target.checked })}
                className="w-3.5 h-3.5 rounded"
              />
              <span className="text-[11px] text-slate-300">Enable rate limiting</span>
            </label>

            {cfg.rateLimitEnabled && (
              <>
                <div>
                  <label className={labelCls}>Max RPS (per instance)</label>
                  <input
                    type="number"
                    value={cfg.rateLimitRps ?? 1000}
                    min={1} max={10_000_000} step={100}
                    onChange={e => save({ rateLimitRps: Number(e.target.value) })}
                    className={inputCls}
                  />
                </div>

                {replicas > 1 && (
                  <div>
                    <label className={labelCls}>Redis for distributed RL</label>
                    <select
                      value={cfg.rateLimitRedisNodeId ?? ''}
                      onChange={e => {
                        const newTarget = e.target.value;
                        save({ rateLimitRedisNodeId: newTarget });
                        // Auto-create / remove edge
                        const handleId = 'ratelimit-redis';
                        const cs = useCanvasStore.getState();
                        cs.removeEdgesWhere(edge => edge.source === node.id && (edge.sourceHandle ?? null) === handleId);
                        if (newTarget) {
                          cs.onConnect({ source: node.id, target: newTarget, sourceHandle: handleId, targetHandle: null });
                        }
                      }}
                      className={inputCls}
                    >
                      <option value="">— select Redis node —</option>
                      {redisNodes.map(n => (
                        <option key={n.id} value={n.id}>
                          {(n.data.config.name as string) || n.data.label} ({n.data.componentType})
                        </option>
                      ))}
                    </select>
                    {!cfg.rateLimitRedisNodeId && (
                      <div className="mt-1 text-[10px] text-yellow-400 flex items-center gap-1">
                        <span>⚠</span>
                        <span>Distributed rate limiting with {replicas} replicas requires Redis for shared state</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </Section>

        {/* Pipelines */}
        <Section title={`Pipelines (${cfg.pipelines.length})`}>
          <div className="space-y-2">
            {cfg.pipelines.map((p, idx) => (
              <PipelineEditor
                key={p.id}
                pipeline={p}
                onChange={updated => updatePipeline(idx, updated)}
                onRemove={() => removePipeline(idx)}
                canRemove={cfg.pipelines.length > 1}
                allNodes={allNodes}
                resources={resources}
              />
            ))}
            <button onClick={addPipeline} className={`w-full ${btnSmCls} py-1.5 mt-1`}>
              + Add Pipeline
            </button>
          </div>
        </Section>

        {/* DB Pools */}
        <Section title={`DB Pools (${cfg.dbPools.length})`} defaultOpen={cfg.dbPools.length > 0}>
          <DbPoolsList
            pools={cfg.dbPools}
            onChange={p => save({ dbPools: p })}
            dbNodes={dbNodes}
            nodeId={node.id}
          />
        </Section>

        {/* Persistent Connections */}
        <Section title={`Persistent Connections (${cfg.persistentConns.length})`} defaultOpen={cfg.persistentConns.length > 0}>
          <PersistentConnsList
            conns={cfg.persistentConns}
            onChange={c => save({ persistentConns: c })}
            targetNodes={allNodes}
            nodeId={node.id}
          />
        </Section>

        {/* Producers */}
        <Section title={`Producers (${cfg.producers.length})`} defaultOpen={cfg.producers.length > 0}>
          <ProducersList
            producers={cfg.producers}
            onChange={p => save({ producers: p })}
            brokerNodes={brokerNodes}
            nodeId={node.id}
          />
        </Section>

        {/* On-demand Connections */}
        <Section title={`On-demand Connections (${cfg.onDemandConns.length})`} defaultOpen={cfg.onDemandConns.length > 0}>
          <OnDemandConnsList
            conns={cfg.onDemandConns}
            onChange={c => save({ onDemandConns: c })}
            allNodes={allNodes}
            nodeId={node.id}
          />
        </Section>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-[var(--color-border)] space-y-2">
        {node.data.componentType === 'service' && (
          <button
            onClick={() => {
              const { pipelines: _p, dbPools: _d, persistentConns: _pc, producers: _pr, onDemandConns: _o, internalLatency: _il, collapsed: _c, ...rest } = node.data.config as Record<string, unknown>;
              void _p; void _d; void _pc; void _pr; void _o; void _il; void _c;
              updateNodeConfig(node.id, rest);
            }}
            className="w-full text-[10px] px-2 py-1.5 rounded border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.06)] text-yellow-500 hover:bg-[rgba(251,191,36,0.12)] transition-colors cursor-pointer"
          >
            Convert back to simple service
          </button>
        )}
        <button
          onClick={() => removeNode(node.id)}
          className="w-full rounded-md border border-[rgba(248,113,113,0.32)] bg-[rgba(248,113,113,0.06)] px-3 py-1.5 text-xs font-medium text-[rgba(248,113,113,0.9)] transition-colors hover:bg-[rgba(248,113,113,0.12)] hover:text-[rgba(252,165,165,0.95)] cursor-pointer"
        >
          Delete Component
        </button>
      </div>
    </div>
  );
}

// ── Upgrade button panel (for regular service nodes) ─────────────────────────

export function ServiceUpgradeButton({ node }: { node: ComponentNode }) {
  const updateNodeConfig = useCanvasStore((s) => s.updateNodeConfig);
  return (
    <div className="px-3 pt-3">
      <div className={`${sectionCls} p-3 space-y-2`}>
        <div className="text-[11px] text-slate-400">
          Convert this service to a <strong className="text-slate-200">Service Container</strong> to configure internal pipelines, DB pools, producers, and consumers.
        </div>
        <button
          onClick={() => {
            const defaults = makeDefaultServiceContainerConfig();
            updateNodeConfig(node.id, { ...node.data.config, ...defaults });
          }}
          className="w-full text-[11px] px-2 py-2 rounded border border-[rgba(110,220,255,0.3)] bg-[rgba(110,220,255,0.06)] text-[var(--color-accent)] hover:bg-[rgba(110,220,255,0.12)] transition-colors cursor-pointer font-medium"
        >
          ⚙ Convert to Service Container
        </button>
      </div>
    </div>
  );
}
