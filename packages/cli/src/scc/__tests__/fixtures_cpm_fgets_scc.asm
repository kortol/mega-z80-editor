	.globl	fgets
	.globl	main
	.module	cpm_fgets.i
	.area	_CODE
main:
	ld	hl,#0
	push	hl
	ld	hl,#16
	push	hl
	ld	hl,#.0+0
	push	hl
	call	fgets
	pop	bc
	pop	bc
	pop	bc
	ret
	.area	_DATA
.0:	.ds	16
	.area	_BSS
