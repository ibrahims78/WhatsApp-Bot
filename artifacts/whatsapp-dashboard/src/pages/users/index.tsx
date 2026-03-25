import { AppLayout } from "@/components/layout/app-layout";
import { useListUsers, useCreateUser, useDeleteUser, getListUsersQueryKey } from "@workspace/api-client-react";
import { useAppStore } from "@/store";
import { getTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Shield, User as UserIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const userSchema = z.object({
  username: z.string().min(3),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(6),
  role: z.enum(["admin", "employee"]),
});

export default function Users() {
  const { data: users, isLoading } = useListUsers();
  const { language, user: currentUser } = useAppStore();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setIsOpen(false);
        form.reset();
        toast({ title: t('success') });
      },
      onError: (e) => toast({ variant: "destructive", title: t('error'), description: t('user_create_error') })
    }
  });

  const deleteMutation = useDeleteUser({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() })
    }
  });

  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: { username: "", email: "", password: "", role: "employee" }
  });

  if (currentUser?.role !== 'admin') {
    return <AppLayout><div className="p-8 text-center text-destructive font-bold text-xl">{t('access_denied')}</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('nav_users')}</h1>
            <p className="text-muted-foreground mt-1">{t('user_subtitle')}</p>
          </div>
          
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="font-semibold shadow-lg shadow-primary/20 hover-elevate">
                <Plus className="w-4 h-4 me-2" />
                {t('user_add_new')}
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{t('user_add_new')}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((v) => createMutation.mutate({ data: v as any }))} className="space-y-4 pt-4">
                  <FormField control={form.control} name="username" render={({ field }) => (
                    <FormItem><FormLabel>{t('user_username')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>{t('user_email')}</FormLabel><FormControl><Input {...field} type="email" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem><FormLabel>{t('user_password')}</FormLabel><FormControl><Input {...field} type="password" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="role" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('user_role')}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="admin">{t('user_admin')}</SelectItem>
                          <SelectItem value="employee">{t('user_employee')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full" disabled={createMutation.isPending}>{t('save')}</Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="glass-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[250px]">{t('user_username')}</TableHead>
                  <TableHead>{t('user_role')}</TableHead>
                  <TableHead>{t('created_at')}</TableHead>
                  <TableHead className="text-end">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8">{t('loading')}</TableCell></TableRow>
                ) : users?.map(u => (
                  <TableRow key={u.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                        <UserIcon className="w-4 h-4 text-secondary-foreground" />
                      </div>
                      <div>
                        {u.username}
                        {u.email && <div className="text-xs text-muted-foreground font-normal">{u.email}</div>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                        {u.role === 'admin' && <Shield className="w-3 h-3 me-1"/>}
                        {t(u.role === 'admin' ? 'user_admin' : 'user_employee')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-end">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
                        onClick={() => {
                          if (confirm(t('are_you_sure'))) deleteMutation.mutate({ id: u.id });
                        }}
                        disabled={deleteMutation.isPending || u.id === currentUser.id}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
