	.globl	outchar
	.globl	main
	.module	stmt_branch.i
	.area	_CODE
main:
	call	flag
	ld	a,h
	or	l
	jp	z,.2
	ld	hl,#84
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	jp	.3
.2:
	ld	hl,#70
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
.3:
	ret
flag:
	ld	hl,#1
	ret
	.area	_BSS
