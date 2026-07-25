import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export function StatCard({
  icon,
  label,
  value,
  detail,
  className,
  labelClassName,
  valueClassName,
  detailClassName,
  children,
}: {
  icon?: ReactNode
  label: string
  value?: string
  detail?: string
  className?: string
  labelClassName?: string
  valueClassName?: string
  detailClassName?: string
  children?: ReactNode
}) {
  return (
    <div className={clsx(className)}>
      <div className={clsx('flex items-center gap-1.5', labelClassName)}>
        {icon}
        {label}
      </div>
      {children ?? (
        <>
          {value !== undefined && <p className={valueClassName}>{value}</p>}
          {detail !== undefined && (
            <p className={clsx(detailClassName, !detail && 'invisible')}>
              {detail || '\u00A0'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
