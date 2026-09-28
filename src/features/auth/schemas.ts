import { z } from 'zod';

const emailField = z.string().min(1, 'El correo es obligatorio').email('Correo inválido');
const passwordField = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres');

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    firstName: z.string().min(1, 'El nombre es obligatorio'),
    lastName: z.string().min(1, 'El apellido es obligatorio'),
    email: emailField,
    password: passwordField,
    confirmPassword: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

// El largo del código se configura en Supabase (Auth > Providers > Email, entre 6 y 10).
export const recoveryCodeSchema = z
  .object({
    code: z.string().trim().regex(/^\d{6,10}$/, 'Ingresá el código numérico que te llegó por correo'),
    password: passwordField,
    confirmPassword: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

export type RecoveryCodeFormValues = z.infer<typeof recoveryCodeSchema>;
