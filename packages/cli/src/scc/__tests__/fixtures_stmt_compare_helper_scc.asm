	.globl	.gt
	.globl	outchar
	.globl	main
	.module	stmt_compare_helper.i
	.area	_CODE
main:
	ld	hl,#66
	push	hl
	ld	hl,#65
	pop	de
	call	.gt
	ld	a,h
	or	l
	jp	z,.2
	ld	hl,#89
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	ret
.2:
	ld	hl,#78
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	ret
	.area	_BSS
