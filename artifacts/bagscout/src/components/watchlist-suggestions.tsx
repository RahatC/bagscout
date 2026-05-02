import { Lightbulb, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useGetPreferenceSuggestions,
  useUpdateBagPreference,
  getGetPreferenceSuggestionsQueryKey,
  getGetBagPreferenceQueryKey,
  getGetPreferenceMatchesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface WatchlistSuggestionsProps {
  preferenceId: number;
  currentSizeIds?: number[];
}

export function WatchlistSuggestions({
  preferenceId,
  currentSizeIds = [],
}: WatchlistSuggestionsProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useGetPreferenceSuggestions(preferenceId, {
    query: {
      enabled: !!preferenceId,
      queryKey: getGetPreferenceSuggestionsQueryKey(preferenceId),
    },
  });

  const updatePref = useUpdateBagPreference();

  const invalidateAll = () => {
    queryClient.invalidateQueries({
      queryKey: getGetPreferenceSuggestionsQueryKey(preferenceId),
    });
    queryClient.invalidateQueries({
      queryKey: getGetBagPreferenceQueryKey(preferenceId),
    });
    queryClient.invalidateQueries({
      queryKey: getGetPreferenceMatchesQueryKey(preferenceId),
    });
  };

  const applyMaxPrice = (value: number) => {
    updatePref.mutate(
      { id: preferenceId, data: { maxPrice: value } },
      {
        onSuccess: () => {
          invalidateAll();
          toast({
            title: "Max price updated",
            description: `New cap: $${value.toLocaleString()}.`,
          });
        },
      },
    );
  };

  const applySizes = (newIds: number[]) => {
    const sizeIds = Array.from(new Set([...currentSizeIds, ...newIds]));
    updatePref.mutate(
      { id: preferenceId, data: { sizeIds } },
      {
        onSuccess: () => {
          invalidateAll();
          toast({
            title: "Sizes added",
            description: "Your watchlist now includes adjacent sizes.",
          });
        },
      },
    );
  };

  const applyCloseColors = () => {
    updatePref.mutate(
      { id: preferenceId, data: { allowCloseColorMatch: true } },
      {
        onSuccess: () => {
          invalidateAll();
          toast({
            title: "Close colors enabled",
            description: "We'll now include nearby shades in the same family.",
          });
        },
      },
    );
  };

  const applyOpenModels = () => {
    updatePref.mutate(
      { id: preferenceId, data: { exactModelEnabled: false } },
      {
        onSuccess: () => {
          invalidateAll();
          toast({
            title: "Adjacent models enabled",
            description: "We'll include related models in the same family.",
          });
        },
      },
    );
  };

  if (isLoading || !data || data.suggestions.length === 0) return null;

  return (
    <div className="border border-primary/30 bg-primary/[0.04] p-6">
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-primary">
          Suggestions
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Small tweaks that can surface more relevant listings.
      </p>

      <ul className="space-y-3">
        {data.suggestions.map((s, i) => (
          <li
            key={i}
            className="border border-border bg-background p-4 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold mb-1">{s.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{s.body}</p>
            </div>
            <div className="shrink-0">
              {s.type === "raise_max_price" && s.suggestedMaxPrice != null && (
                <Button
                  size="sm"
                  className="rounded-none uppercase tracking-widest text-[10px] font-semibold"
                  onClick={() => applyMaxPrice(s.suggestedMaxPrice!)}
                  disabled={updatePref.isPending}
                >
                  Apply <ArrowRight className="ml-1 w-3 h-3" />
                </Button>
              )}
              {s.type === "add_adjacent_sizes" &&
                s.suggestedSizeIds &&
                s.suggestedSizeIds.length > 0 && (
                  <Button
                    size="sm"
                    className="rounded-none uppercase tracking-widest text-[10px] font-semibold"
                    onClick={() => applySizes(s.suggestedSizeIds!)}
                    disabled={updatePref.isPending}
                  >
                    Add sizes <ArrowRight className="ml-1 w-3 h-3" />
                  </Button>
                )}
              {s.type === "add_close_colors" && (
                <Button
                  size="sm"
                  className="rounded-none uppercase tracking-widest text-[10px] font-semibold"
                  onClick={applyCloseColors}
                  disabled={updatePref.isPending}
                >
                  Enable <ArrowRight className="ml-1 w-3 h-3" />
                </Button>
              )}
              {s.type === "include_adjacent_models" && (
                <Button
                  size="sm"
                  className="rounded-none uppercase tracking-widest text-[10px] font-semibold"
                  onClick={applyOpenModels}
                  disabled={updatePref.isPending}
                >
                  Apply <ArrowRight className="ml-1 w-3 h-3" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
