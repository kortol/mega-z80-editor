; Private compiler-helper ABI: DE=left, HL=right, HL=result.
; Numeric C members bind exclusively to these names, never application helpers.
	.globl mz80_fixed_cpu_eq
	.globl mz80_fixed_cpu_ne
	.globl mz80_fixed_cpu_lt
	.globl mz80_fixed_cpu_le
	.globl mz80_fixed_cpu_gt
	.globl mz80_fixed_cpu_ge
	.globl mz80_fixed_cpu_asl
	.globl mz80_fixed_cpu_asr
	.area _CODE
mz80_fixed_cpu_eq:
	or a
	sbc hl,de
	ld hl,#0
	ret nz
	inc hl
	ret
mz80_fixed_cpu_ne:
	or a
	sbc hl,de
	ld hl,#0
	ret z
	inc hl
	ret
mz80_fixed_cpu_lt:
	ld a,d
	xor h
	jp m,mz80_fixed_cpu_lt_sign
	ex de,hl
	or a
	sbc hl,de
	ld hl,#0
	ret nc
	inc hl
	ret
mz80_fixed_cpu_lt_sign:
	bit 7,d
	ld hl,#0
	ret z
	inc hl
	ret
mz80_fixed_cpu_ge:
	call mz80_fixed_cpu_lt
	ld a,l
	xor #1
	ld l,a
	ret
mz80_fixed_cpu_gt:
	ex de,hl
	jp mz80_fixed_cpu_lt
mz80_fixed_cpu_le:
	ex de,hl
	jp mz80_fixed_cpu_ge
mz80_fixed_cpu_asl:
	ld b,l
	ex de,hl
	ld a,b
	or a
	ret z
mz80_fixed_cpu_asl_loop:
	add hl,hl
	djnz mz80_fixed_cpu_asl_loop
	ret
mz80_fixed_cpu_asr:
	ld b,l
	ex de,hl
	ld a,b
	or a
	ret z
mz80_fixed_cpu_asr_loop:
	sra h
	rr l
	djnz mz80_fixed_cpu_asr_loop
	ret
