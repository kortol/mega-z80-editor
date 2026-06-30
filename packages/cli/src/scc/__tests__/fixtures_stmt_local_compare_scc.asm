	.globl	.gt
	.globl	outchar
	.globl	main
	.module	stmt_local_compare.i
	.area	_CODE
main:
	dec	sp
	ld	hl,#0
	add	hl,sp
	ld	(hl),#67
	ld	hl,#0
	add	hl,sp
	ld	l,(hl)
	ld	h,#0
	push	hl
	ld	hl,#66
	pop	de
	call	.gt
	ld	a,h
	or	l
	jp	z,.2
	ld	hl,#87
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	jp	.3
.2:
	ld	hl,#88
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
.3:
	inc	sp
	ret
	.area	_BSS
