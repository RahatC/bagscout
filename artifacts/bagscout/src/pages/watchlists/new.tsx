import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateBagPreference,
  useListBrands,
  useListStyles,
  useListColors,
  useListConditions,
  useListSizes,
  getListBagPreferencesQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

interface FormState {
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
}

const initialState: FormState = {
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
};

export default function WatchlistsNewPage({ isSetup = false }: { isSetup?: boolean }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const totalSteps = 3;
  const [form, setForm] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const { data: brands = [] } = useListBrands();
  const { data: styles = [] } = useListStyles();
  const { data: colors = [] } = useListColors();
  const { data: conditions = [] } = useListConditions();
  const { data: sizes = [] } = useListSizes();

  const createPref = useCreateBagPreference();

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((s) => ({ ...s, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const toggleId = (key: "brandIds" | "styleIds" | "colorIds" | "sizeIds", id: number) => {
    setForm((s) => ({
      ...s,
      [key]: s[key].includes(id) ? s[key].filter((x) => x !== id) : [...s[key], id],
    }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validateStep = (s: number): boolean => {
    const next: typeof errors = {};
    if (s === 1) {
      if (form.nickname.trim().length < 2) next.nickname = "Nickname must be at least 2 characters";
      if (form.brandIds.length === 0) next.brandIds = "Select at least one brand";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const next = () => {
    if (validateStep(step)) setStep(Math.min(step + 1, totalSteps));
  };
  const back = () => setStep(Math.max(step - 1, 1));

  const submit = () => {
    if (!validateStep(1)) {
      setStep(1);
      return;
    }
    createPref.mutate(
      {
        data: {
          nickname: form.nickname,
          brandIds: form.brandIds,
          styleIds: form.styleIds,
          colorIds: form.colorIds,
          sizeIds: form.sizeIds,
          exactModelEnabled: form.exactModelEnabled,
          modelQuery: form.modelQuery || null,
          conditionMinId: form.conditionMinId,
          allowCloseColorMatch: form.allowCloseColorMatch,
          minPrice: form.minPrice ? Number(form.minPrice) : null,
          maxPrice: form.maxPrice ? Number(form.maxPrice) : null,
          onlyExactCriteria: form.onlyExactCriteria,
          allowCloseMatches: form.allowCloseMatches,
          active: true,
        },
      },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getListBagPreferencesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({
            title: "Watchlist created",
            description: `Your watchlist "${result.nickname}" is now scouting.`,
          });
          setLocation(isSetup ? "/dashboard" : `/watchlists/${result.id}`);
        },
        onError: (err: unknown) => {
          toast({
            variant: "destructive",
            title: "Error",
            description:
              err instanceof Error ? err.message : "Failed to create watchlist. Please try again.",
          });
        },
      },
    );
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-serif font-medium mb-3">
          {isSetup ? "Create Your First Watchlist" : "New Watchlist"}
        </h1>
        <p className="text-muted-foreground">Define your ideal piece. We'll find it.</p>
        <div className="mt-8 flex items-center justify-center gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1.5 w-12 rounded-none transition-colors ${
                step >= i ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>
      </div>

      <Card className="rounded-none border-border shadow-none">
        <CardContent className="p-8">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                <div>
                  <h2 className="text-xl font-serif">The Essentials</h2>
                  <p className="text-sm text-muted-foreground mt-1">What are you looking for?</p>
                </div>

                <div className="space-y-2">
                  <Label className="uppercase tracking-widest text-xs font-semibold">
                    Watchlist Name
                  </Label>
                  <Input
                    placeholder="e.g. My Dream Birkin"
                    className="rounded-none h-12"
                    value={form.nickname}
                    onChange={(e) => setField("nickname", e.target.value)}
                  />
                  {errors.nickname && (
                    <p className="text-xs text-destructive">{errors.nickname}</p>
                  )}
                </div>

                <div className="space-y-3">
                  <Label className="uppercase tracking-widest text-xs font-semibold">
                    Brands ({form.brandIds.length} selected)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Select one or more brands to scout.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {brands.map((b) => {
                      const selected = form.brandIds.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => toggleId("brandIds", b.id)}
                          className={`px-3 py-2 text-sm border transition-colors text-left ${
                            selected
                              ? "border-primary bg-primary/10 text-primary font-medium"
                              : "border-border hover:border-foreground/30"
                          }`}
                        >
                          {b.name}
                        </button>
                      );
                    })}
                  </div>
                  {errors.brandIds && (
                    <p className="text-xs text-destructive">{errors.brandIds}</p>
                  )}
                </div>

                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <Label className="uppercase tracking-widest text-xs font-semibold">
                      Specific model?
                    </Label>
                    <Switch
                      checked={form.exactModelEnabled}
                      onCheckedChange={(v) => setField("exactModelEnabled", v)}
                    />
                  </div>
                  {form.exactModelEnabled && (
                    <Input
                      placeholder="e.g. Birkin 30, Classic Flap, Kelly"
                      className="rounded-none h-12"
                      value={form.modelQuery}
                      onChange={(e) => setField("modelQuery", e.target.value)}
                    />
                  )}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                <div>
                  <h2 className="text-xl font-serif">The Details</h2>
                  <p className="text-sm text-muted-foreground mt-1">Narrow down your specs.</p>
                </div>

                <div className="space-y-3">
                  <Label className="uppercase tracking-widest text-xs font-semibold">
                    Styles ({form.styleIds.length} selected)
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {styles.map((s) => {
                      const selected = form.styleIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleId("styleIds", s.id)}
                          className={`px-3 py-1.5 text-xs border transition-colors ${
                            selected
                              ? "border-primary bg-primary/10 text-primary font-medium"
                              : "border-border hover:border-foreground/30"
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="uppercase tracking-widest text-xs font-semibold">
                    Colors ({form.colorIds.length} selected)
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((c) => {
                      const selected = form.colorIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleId("colorIds", c.id)}
                          className={`px-3 py-1.5 text-xs border transition-colors ${
                            selected
                              ? "border-primary bg-primary/10 text-primary font-medium"
                              : "border-border hover:border-foreground/30"
                          }`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <Checkbox
                      checked={form.allowCloseColorMatch}
                      onCheckedChange={(v) => setField("allowCloseColorMatch", !!v)}
                    />
                    <span className="text-xs text-muted-foreground">
                      Also match close colors in the same family
                    </span>
                  </label>
                </div>

                <div className="space-y-3">
                  <Label className="uppercase tracking-widest text-xs font-semibold">
                    Sizes ({form.sizeIds.length} selected)
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {sizes.map((s) => {
                      const selected = form.sizeIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleId("sizeIds", s.id)}
                          className={`px-3 py-1.5 text-xs border transition-colors ${
                            selected
                              ? "border-primary bg-primary/10 text-primary font-medium"
                              : "border-border hover:border-foreground/30"
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="uppercase tracking-widest text-xs font-semibold">
                    Minimum Condition
                  </Label>
                  <Select
                    value={form.conditionMinId?.toString() ?? "any"}
                    onValueChange={(v) =>
                      setField("conditionMinId", v === "any" ? null : Number(v))
                    }
                  >
                    <SelectTrigger className="rounded-none h-12">
                      <SelectValue placeholder="Any condition" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      <SelectItem value="any">Any condition</SelectItem>
                      {conditions.map((c) => (
                        <SelectItem key={c.id} value={c.id.toString()}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                <div>
                  <h2 className="text-xl font-serif">Pricing & Strictness</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Set your budget and how loose your match should be.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="uppercase tracking-widest text-xs font-semibold">
                      Min Price ($)
                    </Label>
                    <Input
                      type="number"
                      placeholder="0"
                      className="rounded-none h-12"
                      value={form.minPrice}
                      onChange={(e) => setField("minPrice", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="uppercase tracking-widest text-xs font-semibold">
                      Max Price ($)
                    </Label>
                    <Input
                      type="number"
                      placeholder="No limit"
                      className="rounded-none h-12"
                      value={form.maxPrice}
                      onChange={(e) => setField("maxPrice", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="uppercase tracking-widest text-xs font-semibold">
                        Only exact criteria
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Stricter — every selected criterion must match perfectly.
                      </p>
                    </div>
                    <Switch
                      checked={form.onlyExactCriteria}
                      onCheckedChange={(v) => setField("onlyExactCriteria", v)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="uppercase tracking-widest text-xs font-semibold">
                        Allow close matches
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Broader — surface partial matches above threshold.
                      </p>
                    </div>
                    <Switch
                      checked={form.allowCloseMatches}
                      onCheckedChange={(v) => setField("allowCloseMatches", v)}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex justify-between pt-8 border-t border-border mt-8">
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={back}
                className="rounded-none uppercase tracking-widest text-xs font-semibold h-12 px-6"
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
            ) : (
              <div />
            )}
            {step < totalSteps ? (
              <Button
                type="button"
                onClick={next}
                className="rounded-none uppercase tracking-widest text-xs font-semibold h-12 px-6"
              >
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={submit}
                disabled={createPref.isPending}
                className="rounded-none uppercase tracking-widest text-xs font-semibold h-12 px-8"
              >
                {createPref.isPending ? "Creating..." : "Save Watchlist"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
