import { z } from 'zod';

export const editProfileSchema = z.object({
  firstName: z.string().min(1, 'El nombre es obligatorio'),
  lastName: z.string().min(1, 'El apellido es obligatorio'),
  phone: z.string().optional(),
});

export type EditProfileFormValues = z.infer<typeof editProfileSchema>;
