	.globl	outchar
	.globl	main
	.module	stmt_local_slot.i
	.area	_CODE
main:
	dec	sp
	ld	hl,#0
	add	hl,sp
	ld	(hl),#76
	ld	hl,#0
	add	hl,sp
	ld	l,(hl)
	ld	h,#0
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	inc	sp
	ret
	.area	_BSS
