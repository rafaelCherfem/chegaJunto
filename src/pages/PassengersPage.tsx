import { UserPlus } from "lucide-react";
import { useState } from "react";
import { PassengerCard } from "@/components/passengers/PassengerCard";
import { PassengerForm } from "@/components/passengers/PassengerForm";
import { Button } from "@/components/ui/button";
import {
  useCreatePassenger,
  useDeletePassenger,
  usePassengers,
  useSetPassengerActive,
  useUpdatePassenger,
} from "@/hooks/usePassengers";
import type { PassengerFormValues } from "@/schemas/passenger.schema";
import type { Passenger } from "@/types/entities";

export function PassengersPage() {
  const { data: passengers, isLoading, isError } = usePassengers(true);
  const createPassenger = useCreatePassenger();
  const updatePassenger = useUpdatePassenger();
  const setPassengerActive = useSetPassengerActive();
  const deletePassenger = useDeletePassenger();

  const [creating, setCreating] = useState(false);
  const [editingPassenger, setEditingPassenger] = useState<Passenger | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{
    id: string;
    message: string;
  } | null>(null);

  const formOpen = creating || editingPassenger !== null;
  const submitting = createPassenger.isPending || updatePassenger.isPending;

  async function handleSubmit(values: PassengerFormValues) {
    setFormError(null);

    try {
      if (editingPassenger) {
        await updatePassenger.mutateAsync({
          id: editingPassenger.id,
          input: values,
        });
      } else {
        await createPassenger.mutateAsync(values);
      }
      setCreating(false);
      setEditingPassenger(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  }

  function handleCancel() {
    setCreating(false);
    setEditingPassenger(null);
    setFormError(null);
  }

  function handleToggleActive(passenger: Passenger) {
    setPassengerActive.mutate({ id: passenger.id, active: !passenger.active });
  }

  async function handleDelete(passenger: Passenger) {
    setDeleteError(null);
    setDeletingId(passenger.id);

    try {
      await deletePassenger.mutateAsync(passenger.id);
    } catch (error) {
      setDeleteError({
        id: passenger.id,
        message: error instanceof Error ? error.message : "Não foi possível excluir.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="page--passengers mx-auto space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-heading">Passageiros</h1>
        {!formOpen && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Novo
          </Button>
        )}
      </div>

      {formOpen && (
        <PassengerForm
          initialValues={editingPassenger ?? undefined}
          submitting={submitting}
          errorMessage={formError}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      )}

      {isLoading && (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando...
        </p>
      )}

      {isError && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar os passageiros. Tente novamente.
        </p>
      )}

      {!isLoading && !isError && passengers?.length === 0 && (
        <p className="text-sm opacity-70">
          Você ainda não possui passageiros cadastrados.
        </p>
      )}

      <div className="space-y-2">
        {passengers?.map((passenger) => (
          <PassengerCard
            key={passenger.id}
            passenger={passenger}
            deleting={deletingId === passenger.id}
            deleteError={deleteError?.id === passenger.id ? deleteError.message : null}
            onEdit={setEditingPassenger}
            onToggleActive={handleToggleActive}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
