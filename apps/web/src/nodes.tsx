import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import type { ReactNode } from 'react';
import { assetUrl, type GenerationData } from './api/endpoints';
import {
  CHAIN_MESSAGE,
  chainOf,
  indexOf,
  KINDS,
  type FlowNode,
  type NodeKind,
  type Scenario,
} from './model';
import { useGraph } from './providers/graph-store';
import { useRuns, useStart } from './generations';
import { Button, ErrorNote, Field, Select, Status, Textarea, type Tone } from './ui';

const RUN_STATE: Record<GenerationData['status'], { tone: Tone; text: string }> = {
  processing: { tone: 'busy', text: 'Генерация выполняется…' },
  succeeded: { tone: 'ok', text: 'Генерация завершена' },
  failed: { tone: 'error', text: 'Отказ генерации: SIMULATED_FAILURE' },
};

const useIndex = () => useGraph((state) => indexOf(state.nodes, state.edges));

function Shell({ id, type, children }: { id: string; type: NodeKind; children: ReactNode }) {
  const { deleteElements } = useReactFlow();
  const spec = KINDS[type];
  return (
    <div className="w-64 rounded-xl border bg-card text-card-foreground shadow-sm">
      {spec.hasTarget ? (
        <>
          <Handle type="target" position={Position.Left} id="in" />
          <span className="absolute -left-2 top-1/2 -translate-x-full translate-y-1 text-[10px] text-muted-foreground">
            вход
          </span>
        </>
      ) : null}
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-xs font-semibold">{spec.title}</h2>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Удалить ноду «${spec.title}»`}
          onClick={() => void deleteElements({ nodes: [{ id }] })}
        >
          ✕
        </Button>
      </header>
      <div className="flex flex-col gap-2 p-3">{children}</div>
      {spec.feeds ? (
        <>
          <Handle type="source" position={Position.Right} id="out" />
          <span className="absolute -right-2 top-1/2 -translate-y-4 translate-x-full text-[10px] text-muted-foreground">
            выход
          </span>
        </>
      ) : null}
    </div>
  );
}

function PromptNode({ id, data }: NodeProps<Extract<FlowNode, { type: 'prompt' }>>) {
  const setValue = useGraph((state) => state.setValue);
  return (
    <Shell id={id} type="prompt">
      <Field label="Описание изображения">
        {(fieldId) => (
          <Textarea
            id={fieldId}
            className="nodrag nowheel h-20 resize-none"
            maxLength={2000}
            value={data.text}
            placeholder="Горы на рассвете"
            onChange={(event) => setValue(id, { text: event.target.value })}
          />
        )}
      </Field>
    </Shell>
  );
}

function GeneratorNode({ id, data }: NodeProps<Extract<FlowNode, { type: 'generator' }>>) {
  const index = useIndex();
  const { byNode } = useRuns();
  const { start, pending, error } = useStart(id);
  const setValue = useGraph((state) => state.setValue);
  const scenario = data.scenario;

  const chain = chainOf(index, id);
  const run = byNode.get(id);
  const processing = run?.status === 'processing';
  const blocked = chain.problem ? CHAIN_MESSAGE[chain.problem] : null;

  return (
    <Shell id={id} type="generator">
      <Field label="Сценарий генерации">
        {(fieldId) => (
          <Select
            id={fieldId}
            className="nodrag"
            value={scenario}
            onChange={(event) => setValue(id, { scenario: event.target.value as Scenario })}
          >
            <option value="success">Успех</option>
            <option value="failure">Отказ (проверка ошибки)</option>
          </Select>
        )}
      </Field>
      <Button
        className="nodrag"
        busy={pending || processing}
        disabled={Boolean(blocked)}
        title={blocked ?? undefined}
        onClick={() => void start(scenario)}
      >
        {run?.status === 'failed' ? 'Повторить генерацию' : 'Сгенерировать'}
      </Button>
      {blocked ? <Status tone="warn">{blocked}</Status> : null}
      {pending && !processing ? <Status tone="busy">Сохранение графа…</Status> : null}
      {run ? <Status tone={RUN_STATE[run.status].tone}>{RUN_STATE[run.status].text}</Status> : null}
      <ErrorNote error={error} />
    </Shell>
  );
}

function ResultNode({ id }: NodeProps<Extract<FlowNode, { type: 'result' }>>) {
  const index = useIndex();
  const { byResult, byNode } = useRuns();

  const source = index.incoming.get(id)?.source;
  const shown = byResult.get(id);
  const image = shown && shown.nodeId === source ? shown.imageUrl : null;
  const pendingRun = source ? byNode.get(source) : undefined;

  return (
    <Shell id={id} type="result">
      {image ? (
        <img alt="Результат генерации" className="w-full rounded-lg border" src={assetUrl(image)} />
      ) : (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
          Изображения пока нет
        </div>
      )}
      {!source ? <Status tone="warn">Подключите генератор</Status> : null}
      {pendingRun?.status === 'processing' ? (
        <Status tone="busy">Ожидание результата…</Status>
      ) : null}
    </Shell>
  );
}

export const nodeTypes = {
  prompt: PromptNode,
  generator: GeneratorNode,
  result: ResultNode,
};
