import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetBagPreferenceQueryKey,
  getGetDashboardSummaryQueryKey,
  getListBagPreferencesQueryKey,
  useGetBagPreference,
  useListBrands,
  useListColors,
  useListConditions,
  useListSizes,
  useListStyles,
  useUpdateBagPreference,
} from "@workspace/api-client-react";

type AlertFrequency = "realtime" | "daily" | "weekly";

type FormState = {
  nickname: string;
  brandIds: number[];
  styleIds: number[];
  colorIds: number[];
  sizeIds: number[];
  exactModelEnabled: boolean;
  modelQuery: string;
  conditionMinId: number | null;
  allowCloseColorMatch: boolean;
  minPrice: string;
  maxPrice: string;
  onlyExactCriteria: boolean;
  allowCloseMatches: boolean;
  alertFrequency: AlertFrequency;
  active: boolean;
};

const emptyForm: FormState = {
  nickname: "",
  brandIds: [],
  styleIds: [],
  colorIds: [],
  sizeIds: [],
  exactModelEnabled: false,
  modelQuery: "",
  conditionMinId: null,
  allowCloseColorMatch: true,
  minPrice: "",
  maxPrice: "",
  onlyExactCriteria: false,
  allowCloseMatches: true,
  alertFrequency: "realtime",
  active: true,
};

type Option = { id: number; name: string };

function toggleId(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

function MultiSelectGrid({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Option[];
  selected: number[];
  onToggle: (id: number) => void;
}) {
  return (
    <div className="space-y-3">
      <Label className="uppercase tracking-widest text-xs font-semibold">
        {label} ({selected.length} selected)
      </Label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {options.map((option) => {
          const checked = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onToggle(option.id)}
              className={`px-3 py-2 text-sm border transition-colors text-left ${
                checked
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              {option.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function WatchlistEditPage() {
  const [, params] = useRoute("/watchlists/:id/edit");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pref, isLoading: isPrefLoading } = useGetBagPreference(id, {
    query: { enabled: !!id, queryKey: getGetBagPreferenceQueryKey(id) },
  });
  const { data: brands = [] } = useListBrands();
  const { data: styles = [] } = useListStyles();
  const { data: colors = [] } = useListColors();
  const { data: sizes = [] } = useListSizes();
  const { data: conditions = [] } = useListConditions();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<{ nickname?: string; brandIds?: string; price?: string }>({});
  const updatePref = useUpdateBagPreference();

  useEffect(() => {
    if (!pref) return;
    setForm({
      nickname: pref.nickname,
      brandIds: pref.brands.map((b) => b.id),
      styleIds: pref.styles.map((s) => s.id),
      colorIds: pref.colors.map((c) => c.id),
      sizeIds: pref.sizes.map((s) => s.id),
      exactModelEnabled: pref.exactModelEnabled,
      modelQuery: pref.modelQuery ?? "",
      conditionMinId: pref.conditionMin?.id ?? null,
      allowCloseColorMatch: pref.allowCloseColorMatch,
      minPrice: pref.minPrice != null ? String(pref.minPrice) : "",
      maxPrice: pref.maxPrice != null ? String(pref.maxPrice) : "",
      onlyExactCriteria: pref.onlyExactCriteria,
      allowCloseMatches: pref.allowCloseMatches,
      alertFrequency:
        pref.alertFrequency === "daily" || pref.alertFrequency === "weekly"
          ? pref.alertFrequency
          : "realtime",
      active: pref.active,
    });
  }, [pref]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors({});
  };

  const validate = () => {
    const next: typeof errors = {};
    if (form.nickname.trim().length < 2) {
      next.nickname = "Watchlist name must be at least 2 characters.";
    }
    if (form.brandIds.length === 0) {
      next.brandIds = "Select at least one brand.";
    }
    const min = form.minPrice ? Number(form.minPrice) : null;
    const max = form.maxPrice ? Number(form.maxPrice) : null;
    if ((min != null && Number.isNaN(min)) || (max != null && Number.isNaN(max))) {
      next.price = "Prices must be valid numbers.";
    } else if (min != null && max != null && min > max) {
      next.price = "Minimum price cannot be greater than maximum price.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (!id || !validate()) return;
    updatePref.mutate(
      {
        id,
        data: {
          nickname: form.nickname.trim(),
          brandIds: form.brandIds,
          styleIds: form.styleIds,
          colorIds: form.colorIds,
          sizeIds: form.sizeIds,
          exactModelEnabled: form.exactModelEnabled,
          modelQuery: form.modelQuery.trim() || null,
          conditionMinId: form.conditionMinId,
          allowCloseColorMatch: form.allowCloseColorMatch,
          minPrice: form.minPrice ? Number(form.minPrice) : null,
          maxPrice: form.maxPrice ? Number(form.maxPrice) : null,
          onlyExactCriteria: form.onlyExactCriteria,
          allowCloseMatches: form.allowCloseMatches,
          alertFrequency: form.alertFrequency,
          active: form.active,
        },
      },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetBagPreferenceQueryKey(id), updated);
          queryClient.invalidateQueries({ queryKey: getListBagPreferencesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({
            title: "Watchlist updated",
            description: `"${updated.nickname}" has been saved.`,
          });
          setLocation(`/watchlists/${id}`);
        },
        onError: (err: unknown) => {
          toast({
            variant: "destructive",
            title: "Could not update watchlist",
            description:
              err instanceof Error ? err.message : "Please check your criteria and try again.",
          });
        },
      },
    );
  };

  if (isPrefLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48 rounded-none" />
        <Skeleton className="h-[640px] w-full rounded-none" />
      </div>
    );
  }

  if (!pref) {
    return (
      <div className="max-w-4xl mx-auto">
        <p>Watchlist not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <div className="flex items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <Link href={`/watchlists/${id}`}>
            <Button
              variant="ghost"
              className="rounded-none uppercase tracking-widest text-xs font-semibold pl-0 hover:bg-transparent"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to watchlist
            </Button>
          </Link>
          <h1 className="text-3xl font-serif font-medium mt-2">Edit Watchlist</h1>
          <p className="text-muted-foreground mt-1">
            Update the exact criteria BagScout uses for matches and alerts.
          </p>
        </div>
      </div>

      <Card className="rounded-none border-border shadow-none">
        <CardContent className="p-6 sm:p-8 space-y-10">
          <section className="space-y-6">
            <div>
              <h2 className="font-serif text-xl mb-1">Basics</h2>
              <p className="text-sm text-muted-foreground">
                Name the watchlist and choose the brands we should scout.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="uppercase tracking-widest text-xs font-semibold">
                Watchlist name
              </Label>
              <Input
                className="rounded-none h-12"
                value={form.nickname}
                onChange={(e) => setField("nickname", e.target.value)}
              />
              {errors.nickname && <p className="text-xs text-destructive">{errors.nickname}</p>}
            </div>
            <MultiSelectGrid
              label="Brands"
              options={brands}
              selected={form.brandIds}
              onToggle={(brandId) => setField("brandIds", toggleId(form.brandIds, brandId))}
            />
            {errors.brandIds && <p className="text-xs text-destructive">{errors.brandIds}</p>}
          </section>

          <section className="space-y-6">
            <div>
              <h2 className="font-serif text-xl mb-1">Bag details</h2>
              <p className="text-sm text-muted-foreground">
                Adjust style, color, size, model, and minimum condition.
              </p>
            </div>
            <MultiSelectGrid
              label="Styles"
              options={styles}
              selected={form.styleIds}
              onToggle={(styleId) => setField("styleIds", toggleId(form.styleIds, styleId))}
            />
            <MultiSelectGrid
              label="Colors"
              options={colors}
              selected={form.colorIds}
              onToggle={(colorId) => setField("colorIds", toggleId(form.colorIds, colorId))}
            />
            <MultiSelectGrid
              label="Sizes"
              options={sizes}
              selected={form.sizeIds}
              onToggle={(sizeId) => setField("sizeIds", toggleId(form.sizeIds, sizeId))}
            />

            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="uppercase tracking-widest text-xs font-semibold">
                  Exact model query
                </Label>
                <Input
                  className="rounded-none h-12"
                  placeholder="e.g. Birkin 30, Classic Flap"
                  value={form.modelQuery}
                  onChange={(e) => setField("modelQuery", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="uppercase tracking-widest text-xs font-semibold">
                  Minimum condition
                </Label>
                <Select
                  value={form.conditionMinId != null ? String(form.conditionMinId) : "none"}
                  onValueChange={(value) =>
                    setField("conditionMinId", value === "none" ? null : Number(value))
                  }
                >
                  <SelectTrigger className="rounded-none h-12">
                    <SelectValue placeholder="Any condition" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    <SelectItem value="none">Any condition</SelectItem>
                    {conditions.map((condition) => (
                      <SelectItem key={condition.id} value={String(condition.id)}>
                        {condition.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div>
              <h2 className="font-serif text-xl mb-1">Price and matching</h2>
              <p className="text-sm text-muted-foreground">
                Control price range, close matches, and exact-only behavior.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="uppercase tracking-widest text-xs font-semibold">
                  Minimum price
                </Label>
                <Input
                  type="number"
                  min="0"
                  className="rounded-none h-12"
                  value={form.minPrice}
                  onChange={(e) => setField("minPrice", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="uppercase tracking-widest text-xs font-semibold">
                  Maximum price
                </Label>
                <Input
                  type="number"
                  min="0"
                  className="rounded-none h-12"
                  value={form.maxPrice}
                  onChange={(e) => setField("maxPrice", e.target.value)}
                />
              </div>
            </div>
            {errors.price && <p className="text-xs text-destructive">{errors.price}</p>}

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="flex items-start gap-3 border border-border p-4 cursor-pointer">
                <Checkbox
                  checked={form.exactModelEnabled}
                  onCheckedChange={(checked) => setField("exactModelEnabled", checked === true)}
                />
                <span>
                  <span className="block text-sm font-medium">Use exact model query</span>
                  <span className="block text-xs text-muted-foreground mt-1">
                    Give model matches more weight when a query is entered.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 border border-border p-4 cursor-pointer">
                <Checkbox
                  checked={form.onlyExactCriteria}
                  onCheckedChange={(checked) => setField("onlyExactCriteria", checked === true)}
                />
                <span>
                  <span className="block text-sm font-medium">Only exact criteria</span>
                  <span className="block text-xs text-muted-foreground mt-1">
                    Reject close matches for selected criteria.
                  </span>
                </span>
              </label>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex items-center justify-between border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Allow close matches</p>
                  <p className="text-xs text-muted-foreground mt-1">Use smart near-match rules.</p>
                </div>
                <Switch
                  checked={form.allowCloseMatches}
                  onCheckedChange={(checked) => setField("allowCloseMatches", checked)}
                />
              </div>
              <div className="flex items-center justify-between border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Allow close color matches</p>
                  <p className="text-xs text-muted-foreground mt-1">Match nearby color families.</p>
                </div>
                <Switch
                  checked={form.allowCloseColorMatch}
                  onCheckedChange={(checked) => setField("allowCloseColorMatch", checked)}
                />
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div>
              <h2 className="font-serif text-xl mb-1">Alerts</h2>
              <p className="text-sm text-muted-foreground">
                Set whether this watchlist is active and how often email alerts should send.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="uppercase tracking-widest text-xs font-semibold">
                  Alert rhythm
                </Label>
                <Select
                  value={form.alertFrequency}
                  onValueChange={(value) => setField("alertFrequency", value as AlertFrequency)}
                >
                  <SelectTrigger className="rounded-none h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    <SelectItem value="realtime">Real-time email</SelectItem>
                    <SelectItem value="daily">Daily digest</SelectItem>
                    <SelectItem value="weekly">Weekly digest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Watchlist active</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Paused watchlists do not generate new alerts.
                  </p>
                </div>
                <Switch
                  checked={form.active}
                  onCheckedChange={(checked) => setField("active", checked)}
                />
              </div>
            </div>
          </section>

          <div className="flex flex-col sm:flex-row justify-end gap-3 border-t border-border pt-6">
            <Button
              asChild
              variant="outline"
              className="rounded-none uppercase tracking-widest text-xs font-semibold"
            >
              <Link href={`/watchlists/${id}`}>Cancel</Link>
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={updatePref.isPending}
              className="rounded-none uppercase tracking-widest text-xs font-semibold"
            >
              <Save className="mr-2 h-4 w-4" />
              Save Watchlist
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
