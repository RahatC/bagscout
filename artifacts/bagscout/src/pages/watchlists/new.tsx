import { useState } from "react";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateWatchlist, getListWatchlistsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

const formSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  brand: z.string().min(2, { message: "Brand is required." }),
  model: z.string().optional(),
  style: z.string().optional(),
  color: z.string().optional(),
  size: z.string().optional(),
  condition: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  matchType: z.enum(["exact", "close"]).default("exact"),
});

const BRANDS = ["Hermès", "Chanel", "Louis Vuitton", "Dior", "Gucci", "Goyard", "Celine", "Bottega Veneta", "Prada", "Saint Laurent", "Fendi", "Loewe"];
const CONDITIONS = ["Excellent", "Very Good", "Good", "Fair", "Pristine", "Like New"];

export default function WatchlistsNewPage({ isSetup = false }: { isSetup?: boolean }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const totalSteps = 3;
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      brand: "",
      model: "",
      style: "",
      color: "",
      size: "",
      condition: "",
      matchType: "exact",
    },
  });

  const createWatchlist = useCreateWatchlist();

  function onSubmit(values: z.infer<typeof formSchema>) {
    createWatchlist.mutate(
      { data: values as any },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getListWatchlistsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({
            title: "Watchlist created",
            description: `Your watchlist "${result.name}" has been created successfully.`,
          });
          setLocation(isSetup ? "/dashboard" : `/watchlists/${result.id}`);
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Error",
            description: error.message || "Failed to create watchlist. Please try again.",
          });
        }
      }
    );
  }

  const nextStep = async () => {
    const fieldsToValidate = step === 1 
      ? ["name", "brand", "model"] 
      : step === 2 
      ? ["color", "size", "condition"] 
      : [];
      
    const isValid = await form.trigger(fieldsToValidate as any);
    if (isValid) {
      setStep(Math.min(step + 1, totalSteps));
    }
  };

  const prevStep = () => {
    setStep(Math.max(step - 1, 1));
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-serif font-medium mb-3">{isSetup ? "Create Your First Watchlist" : "New Watchlist"}</h1>
        <p className="text-muted-foreground">Define your ideal piece. We'll find it.</p>
        
        <div className="mt-8 flex items-center justify-center gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`h-1.5 w-12 rounded-none transition-colors ${step >= i ? "bg-primary" : "bg-border"}`} />
          ))}
        </div>
      </div>

      <Card className="rounded-none border-border shadow-none">
        <CardContent className="p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                  >
                    <div className="space-y-4">
                      <h2 className="text-xl font-serif">The Essentials</h2>
                      <p className="text-sm text-muted-foreground">What are you looking for?</p>
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="uppercase tracking-widest text-xs font-semibold">Watchlist Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. My Dream Birkin" className="rounded-none h-12" {...field} />
                          </FormControl>
                          <FormDescription>A memorable name for your alerts.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="brand"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="uppercase tracking-widest text-xs font-semibold">Brand</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-none h-12">
                                <SelectValue placeholder="Select a brand" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-none">
                              {BRANDS.map(brand => (
                                <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="uppercase tracking-widest text-xs font-semibold">Model (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Birkin, Classic Flap, Kelly" className="rounded-none h-12" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                  >
                    <div className="space-y-4">
                      <h2 className="text-xl font-serif">The Details</h2>
                      <p className="text-sm text-muted-foreground">Narrow down the exact specifications.</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="color"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="uppercase tracking-widest text-xs font-semibold">Color</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Noir, Etoupe" className="rounded-none h-12" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="size"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="uppercase tracking-widest text-xs font-semibold">Size</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. 30, Medium" className="rounded-none h-12" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="style"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="uppercase tracking-widest text-xs font-semibold">Style / Leather</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Togo, Caviar, Gold Hardware" className="rounded-none h-12" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="condition"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="uppercase tracking-widest text-xs font-semibold">Minimum Condition</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-none h-12">
                                <SelectValue placeholder="Any condition" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-none">
                              {CONDITIONS.map(condition => (
                                <SelectItem key={condition} value={condition}>{condition}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                  >
                    <div className="space-y-4">
                      <h2 className="text-xl font-serif">Pricing & Alerts</h2>
                      <p className="text-sm text-muted-foreground">Set your budget and matching strictness.</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="minPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="uppercase tracking-widest text-xs font-semibold">Min Price ($)</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="0" className="rounded-none h-12" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="maxPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="uppercase tracking-widest text-xs font-semibold">Max Price ($)</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="No limit" className="rounded-none h-12" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="matchType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="uppercase tracking-widest text-xs font-semibold">Match Strictness</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-none h-12">
                                <SelectValue placeholder="Select strictness" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-none">
                              <SelectItem value="exact">Exact Match Only (Stricter)</SelectItem>
                              <SelectItem value="close">Close Matches Allowed (Broader)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Exact matches require all specified fields to match perfectly. Close matches will alert you on items that are very similar but might differ slightly in condition or minor specs.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex justify-between pt-6 border-t border-border mt-8">
                {step > 1 ? (
                  <Button type="button" variant="outline" onClick={prevStep} className="rounded-none uppercase tracking-widest text-xs font-semibold h-12 px-6">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                ) : (
                  <div /> // Spacer
                )}
                
                {step < totalSteps ? (
                  <Button type="button" onClick={nextStep} className="rounded-none uppercase tracking-widest text-xs font-semibold h-12 px-6">
                    Next <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={createWatchlist.isPending} className="rounded-none uppercase tracking-widest text-xs font-semibold h-12 px-8">
                    {createWatchlist.isPending ? "Creating..." : "Save Watchlist"}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}