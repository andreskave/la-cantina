// Imprime el SQL con los datos de ejemplo (los mismos del modo demostración) para una
// cantina existente. Solo para desarrollo.
//
//   node scripts/seed-demo.ts "La Cantina" > seed-demo.sql
//
// Después pegalo en el SQL editor de Supabase (corre como administrador de la base).
import { datosDemo } from '../src/demo/datosDemo.ts'
import { sqlDemo } from '../src/demo/sqlDemo.ts'

process.stdout.write(sqlDemo(datosDemo(), process.argv[2] ?? 'La Cantina'))
