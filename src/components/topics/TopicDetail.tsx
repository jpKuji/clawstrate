import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TopicAction {
  action: {
    id: string;
    title: string | null;
    content: string | null;
    actionType: string;
    performedAt: string;
    upvotes: number | null;
  };
  agentName: string | null;
  autonomyScore: number | null;
  sentiment: number | null;
}

interface Topic {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  velocity: number | null;
  actionCount: number | null;
  agentCount: number | null;
  avgSentiment: number | null;
}

export function TopicDetail({
  topic,
  recentActions,
}: {
  topic: Topic;
  recentActions: TopicAction[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">{topic.name}</h1>
        <p className="text-sm text-zinc-500 mt-1">/{topic.slug}</p>
        {topic.description && (
          <p className="text-sm text-zinc-400 mt-2">{topic.description}</p>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Velocity", value: `${(topic.velocity ?? 0).toFixed(2)}/hr` },
          { label: "Actions", value: topic.actionCount ?? 0 },
          { label: "Agents", value: topic.agentCount ?? 0 },
          { label: "Avg Sentiment", value: topic.avgSentiment != null ? topic.avgSentiment.toFixed(2) : "—" },
        ].map((s) => (
          <Card key={s.label} className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4">
              <p className="text-xs text-zinc-400">{s.label}</p>
              <p className="text-xl font-bold text-zinc-100">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-400">Recent Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentActions.map((item) => (
              <div key={item.action.id} className="border-b border-zinc-800 pb-3 last:border-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                    {item.action.actionType}
                  </Badge>
                  {item.agentName && (
                    <span className="text-xs text-zinc-300">{item.agentName}</span>
                  )}
                  <span className="text-xs text-zinc-600 ml-auto">
                    {new Date(item.action.performedAt).toLocaleString()}
                  </span>
                </div>
                {item.action.title && (
                  <p className="text-sm font-medium text-zinc-200">{item.action.title}</p>
                )}
                {item.action.content && (
                  <p className="text-xs text-zinc-400 line-clamp-2 mt-1">
                    {item.action.content.slice(0, 200)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
