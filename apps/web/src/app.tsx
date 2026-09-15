import { useCallback, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStoreApi,
  type Edge,
  type Node,
  type NodeOrigin,
} from '@xyflow/react';
import { QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { endpoints } from './api/endpoints';
import { client } from './api/client';
import { canConnect, indexOf, KIND_LIST, KINDS, type GraphIndex } from './model';
import { queryClient, spacesQuery } from './api/queries';
import { useSession } from './store';
import { GraphStoreProvider, useGraph } from './providers/graph-store';
import { nodeTypes } from './nodes';
import { Tracker } from './components/tracker';
import { SyncProvider, useSaveState, useSync } from './providers/sync';
import { ArrowLeftIcon, ArrowUpRightIcon, PlusIcon } from '@phosphor-icons/react';
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group';
import { SAVE_RULES } from './save-status';
import { Button, ErrorNote, Field, Input, Status, type Tone } from './ui';
import { Separator } from '@base-ui/react';

const PROXIMITY = 800;

const NODE_ORIGIN: NodeOrigin = [0.5, 0.5];

const CASCADE = 28;

const TONE_ICON: Record<Tone, string> = {
  idle: 'text-muted-foreground',
  busy: 'text-primary',
  ok: 'text-emerald-600',
  warn: 'text-amber-600',
  error: 'text-destructive',
};

function useProximity(index: GraphIndex) {
  const store = useStoreApi();
  const onConnect = useGraph((state) => state.onConnect);
  const [temp, setTemp] = useState<Edge | null>(null);

  const onNodeDrag = useCallback(
    (_event: unknown, node: Node) => {
      const { nodeLookup } = store.getState();
      const from = nodeLookup.get(node.id)?.internals.positionAbsolute;
      let bestId: string | null = null;
      let bestDistance = PROXIMITY * PROXIMITY;
      let bestForward = true;
      if (from) {
        for (const other of nodeLookup.values()) {
          if (other.id === node.id) continue;
          const dx = other.internals.positionAbsolute.x - from.x;
          const dy = other.internals.positionAbsolute.y - from.y;
          const distance = dx * dx + dy * dy;
          if (distance >= bestDistance) continue;
          const forward = canConnect(index, node.id, other.id);
          if (!forward && !canConnect(index, other.id, node.id)) continue;
          bestId = other.id;
          bestDistance = distance;
          bestForward = forward;
        }
      }
      setTemp((previous) => {
        if (!bestId) return previous === null ? previous : null;
        const source = bestForward ? node.id : bestId;
        const target = bestForward ? bestId : node.id;
        if (previous?.source === source && previous.target === target) return previous;
        return { id: 'proximity', source, target, animated: true };
      });
    },
    [index, store],
  );

  const onNodeDragStop = useCallback(() => {
    setTemp((previous) => {
      if (previous)
        onConnect({
          source: previous.source,
          target: previous.target,
          sourceHandle: null,
          targetHandle: null,
        });
      return null;
    });
  }, [onConnect]);

  return { temp, onNodeDrag, onNodeDragStop };
}

function Canvas() {
  const nodes = useGraph((state) => state.nodes);
  const edges = useGraph((state) => state.edges);
  const viewport = useGraph((state) => state.viewport);
  const onViewportChange = useGraph((state) => state.onViewportChange);
  const onNodesChange = useGraph((state) => state.onNodesChange);
  const onEdgesChange = useGraph((state) => state.onEdgesChange);
  const onConnect = useGraph((state) => state.onConnect);
  const onMoveEnd = useGraph((state) => state.onMoveEnd);

  const index = indexOf(nodes, edges);
  const { temp, onNodeDrag, onNodeDragStop } = useProximity(index);

  return (
    <ReactFlow
      nodes={nodes}
      viewport={viewport}
      edges={temp ? edges.concat(temp) : edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      onViewportChange={onViewportChange}
      onMoveEnd={(_event, next) => onMoveEnd(next)}
      isValidConnection={(connection) =>
        Boolean(
          connection.source &&
          connection.target &&
          canConnect(index, connection.source, connection.target),
        )
      }
      nodeOrigin={NODE_ORIGIN}
      deleteKeyCode={['Backspace', 'Delete']}
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}

function Toolbar() {
  const addNode = useGraph((state) => state.addNode);
  const count = useGraph((state) => state.nodes.length);
  const instance = useReactFlow();
  const store = useStoreApi();
  const { state } = useSaveState();
  const StateIcon = state.icon;

  const add = (kind: (typeof KIND_LIST)[number]) => {
    const rect = store.getState().domNode?.getBoundingClientRect();
    const middle = rect
      ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const at = instance.screenToFlowPosition(middle);
    const step = (count % 5) * CASCADE;
    addNode(kind, { x: Math.round(at.x + step), y: Math.round(at.y + step) });
  };

  return (
    <div className="pointer-events-auto gap-2 absolute inset-x-0 w-fit mx-auto bottom-6 flex justify-center">
      <ButtonGroup className="pointer-events-auto rounded-2xl bg-card">
        {KIND_LIST.map((kind) => (
          <Button
            key={kind}
            variant="outline"
            className="text-xs "
            aria-label={`Добавить ${KINDS[kind].title}`}
            onClick={() => add(kind)}
          >
            <PlusIcon weight="bold" className="size-3" /> {KINDS[kind].title}
          </Button>
        ))}
      </ButtonGroup>
      <ButtonGroupText data-save-status={state.status} title={state.text}>
        <StateIcon aria-hidden className={TONE_ICON[state.tone]} />
        <span className="grid">
          {SAVE_RULES.map((rule) => (
            <span
              key={rule.status}
              aria-hidden
              className="invisible col-start-1 row-start-1 text-xs whitespace-nowrap"
            >
              {rule.text}
            </span>
          ))}
          <Status
            tone={state.tone}
            className="col-start-1 row-start-1 self-center whitespace-nowrap"
          >
            {state.text}
          </Status>
        </span>
      </ButtonGroupText>
    </div>
  );
}

function Notices({ title, onBack }: { title: string; onBack: () => void }) {
  const { reread, retrySave } = useSync();
  const { state, error, loadError } = useSaveState();
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 flex flex-col items-center gap-2 px-4">
      <h1 className="pointer-events-auto absolute top-1 left-4">
        <Button
          variant="outline"
          className="bg-card font-semibold"
          aria-label={`Назад к пространствам: ${title}`}
          onClick={onBack}
        >
          <ArrowLeftIcon weight="bold" className="size-3.5" />
          {title}
        </Button>
      </h1>
      {loadError ? (
        <div className="pointer-events-auto max-w-xl">
          <ErrorNote error={loadError} action="Назад к пространствам" onAction={onBack} />
        </div>
      ) : state.status === 'conflict' ? (
        <div
          className="pointer-events-auto flex max-w-xl items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 shadow-sm"
          role="alert"
        >
          <span>
            Сервер хранит другую версию графа. Ваш черновик сохранён локально; перечитайте граф,
            чтобы продолжить сохранение.
          </span>
          <Button size="xs" variant="outline" onClick={() => void reread()}>
            Перечитать граф
          </Button>
        </div>
      ) : (
        <div className="pointer-events-auto max-w-xl">
          <ErrorNote error={error} action="Повторить сохранение" onAction={retrySave} />
        </div>
      )}
    </div>
  );
}

function Workspace({ spaceId, title }: { spaceId: string; title: string }) {
  const close = useSession((s) => s.close);
  return (
    <GraphStoreProvider key={spaceId} spaceId={spaceId}>
      <SyncProvider spaceId={spaceId}>
        <Tracker />
        <div className="relative h-screen min-w-[1280px] overflow-hidden">
          <Canvas />
          <Notices title={title} onBack={close} />
          <Toolbar />
        </div>
      </SyncProvider>
    </GraphStoreProvider>
  );
}

function SpacePicker() {
  const open = useSession((s) => s.open);
  const spaces = useQuery(spacesQuery);
  const [title, setTitle] = useState('Мой канвас');

  const create = useMutation({
    mutationFn: (title: string) => client(endpoints.createSpace, { title }),
    onSuccess: (space) => {
      void queryClient.invalidateQueries({ queryKey: spacesQuery.queryKey });
      open(space.id);
    },
  });

  return (
    <div className="mx-auto flex w-[520px] flex-col gap-4 p-8">
      <h1 className="text-base font-semibold">Рабочие пространства</h1>
      <Field label="Название нового пространства">
        {(id) => (
          <ButtonGroup>
            <Input
              id={id}
              className="!h-8 py-0"
              value={title}
              maxLength={80}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              busy={create.isPending}
              disabled={!title.trim()}
              onClick={() => create.mutate(title)}
            >
              Создать и открыть
            </Button>
          </ButtonGroup>
        )}
      </Field>
      <Separator className="shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch" />
      <ErrorNote error={create.error ?? null} />
      <h2 className="text-sm font-semibold">Существующие</h2>
      {spaces.isPending ? <Status tone="busy">Загрузка…</Status> : null}
      <ErrorNote
        error={spaces.error ?? null}
        action="Повторить"
        onAction={() => void spaces.refetch()}
      />
      <ul className="flex flex-wrap gap-1">
        {spaces.data?.map((space) => (
          <li key={space.id}>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => open(space.id)}
            >
              {space.title}
              <ArrowUpRightIcon />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Root() {
  const spaceId = useSession((s) => s.spaceId);
  const spaces = useQuery(spacesQuery);
  if (!spaceId) return <SpacePicker />;
  const title = spaces.data?.find((space) => space.id === spaceId)?.title ?? 'Канвас';
  return <Workspace spaceId={spaceId} title={title} />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ReactFlowProvider>
        <Root />
      </ReactFlowProvider>
    </QueryClientProvider>
  );
}
